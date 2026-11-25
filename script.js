/* ============================================================
   Voz Segura — interações
   Menu mobile · rolagem suave · navegação ativa · modal de denúncia
   · Supabase: envio de denúncias, migração local e Auth da equipe
   ============================================================ */
(function () {
  "use strict";

  const header = document.querySelector(".site-header");
  const nav = document.getElementById("primary-nav");
  const menuToggle = document.getElementById("menu-toggle");

  /* ----------------------------------------------------------
     Configuração
     ---------------------------------------------------------- */
  const STORAGE_KEY = "vozsegura.denuncias";
  const AUTH_KEY = "vozsegura.autenticado";

  // Hash SHA-256 da senha padrão "vozsegura2024".
  // Usado apenas no modo demonstração (sem Supabase configurado).
  const ACCESS_HASH = "574167af28916952c6bf65831e0cc6864c602458cfe23a343804fc31d7106d60";

  const TIPOS_PERMITIDOS = [
    "bullying escolar",
    "cyberbullying",
    "abuso sexual",
    "violência psicológica",
    "assédio",
    "outro",
  ];

  const supabaseConfig = window.VOZSEGURA_SUPABASE || {};
  const SUPABASE_CONFIGURED = Boolean(
    supabaseConfig.url &&
      supabaseConfig.anonKey &&
      supabaseConfig.url.indexOf("http") === 0
  );

  let createClient = null;
  let supabase = null;
  let supabasePromise = null;
  let usingSupabase = false;
  let migrating = false;

  /* ----------------------------------------------------------
     Utilidades
     ---------------------------------------------------------- */
  const headerOffset = () => (header ? header.offsetHeight : 0);

  function smoothScrollTo(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - headerOffset() + 1;
    window.scrollTo({ top, behavior: "smooth" });
  }

  function normalizeTipo(tipo) {
    const value = String(tipo || "").trim().toLowerCase();
    return TIPOS_PERMITIDOS.indexOf(value) > -1 ? value : "outro";
  }

  function isOfflineError(error) {
    if (navigator.onLine === false) return true;
    const message = String((error && error.message) || error || "").toLowerCase();
    return (
      message.indexOf("fetch") > -1 ||
      message.indexOf("network") > -1 ||
      message.indexOf("offline") > -1 ||
      message.indexOf("load failed") > -1
    );
  }

  /* ----------------------------------------------------------
     1. Menu mobile
     ---------------------------------------------------------- */
  function closeMenu() {
    if (!nav) return;
    nav.classList.remove("is-open");
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
  }

  function toggleMenu() {
    if (!nav) return;
    const isOpen = nav.classList.toggle("is-open");
    if (menuToggle) menuToggle.setAttribute("aria-expanded", String(isOpen));
  }

  if (menuToggle) {
    menuToggle.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleMenu();
    });
  }

  document.addEventListener("click", function (event) {
    if (!nav || !nav.classList.contains("is-open")) return;
    if (!nav.contains(event.target) && event.target !== menuToggle) closeMenu();
  });

  /* ----------------------------------------------------------
     2. Rolagem suave + link ativo
     ---------------------------------------------------------- */
  const scrollTriggers = document.querySelectorAll("[data-scroll]");

  scrollTriggers.forEach(function (trigger) {
    trigger.addEventListener("click", function () {
      smoothScrollTo(trigger.dataset.scroll);
      closeMenu();
    });
  });

  const navLinks = Array.prototype.slice.call(
    document.querySelectorAll(".nav__link[data-scroll]")
  );

  function setActiveLink(id) {
    navLinks.forEach(function (link) {
      link.classList.toggle("is-active", link.dataset.scroll === id);
    });
  }

  if ("IntersectionObserver" in window && navLinks.length) {
    const sections = navLinks
      .map(function (link) {
        return document.getElementById(link.dataset.scroll);
      })
      .filter(Boolean);

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActiveLink(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  /* ----------------------------------------------------------
     3. Animação de entrada das seções
     ---------------------------------------------------------- */
  const revealItems = document.querySelectorAll(".reveal");

  if ("IntersectionObserver" in window && revealItems.length) {
    const revealObserver = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    revealItems.forEach(function (item) {
      revealObserver.observe(item);
    });
  } else {
    revealItems.forEach(function (item) {
      item.classList.add("is-visible");
    });
  }

  /* ----------------------------------------------------------
     Supabase — cliente carregado sob demanda
     ---------------------------------------------------------- */
  function ensureSupabase() {
    if (!SUPABASE_CONFIGURED) return Promise.resolve(null);
    if (supabasePromise) return supabasePromise;

    supabasePromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")
      .then(function (module) {
        createClient = module.createClient;
        supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        });
        usingSupabase = true;
        return supabase;
      })
      .catch(function (error) {
        console.warn("Supabase indisponível; usando armazenamento local:", error);
        usingSupabase = false;
        supabasePromise = null; // permite nova tentativa na próxima ação
        return null;
      });

    return supabasePromise;
  }

  /* ----------------------------------------------------------
     Armazenamento local (modo demonstração / fila de envio)
     ---------------------------------------------------------- */
  function loadReports() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(data) ? data : [];
    } catch (error) {
      return [];
    }
  }

  function saveReports(reports) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
    } catch (error) {
      /* armazenamento indisponível: a denúncia ainda é confirmada ao usuário */
    }
  }

  function makeProtocol() {
    const stamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(Math.random() * 1679616)
      .toString(36)
      .toUpperCase()
      .padStart(4, "0");
    return "VZ-" + stamp + "-" + random;
  }

  /* ----------------------------------------------------------
     Banco de dados — inserção, consulta e exclusão
     ---------------------------------------------------------- */
  async function sendReport(report) {
    const client = await ensureSupabase();
    if (!client) return { ok: false, offline: true };

    const payload = {
      protocolo: report.id,
      criado_em: report.data || new Date().toISOString(),
      tipo: normalizeTipo(report.tipo),
      descricao: report.descricao,
      local: report.local || "",
    };

    try {
      // INSERT anônimo: sem .select(), o PostgREST usa "return=minimal" e não
      // exige o privilégio de leitura, que é negado ao papel anon por RLS.
      const result = await client.from("denuncias").insert(payload);
      if (!result.error) return { ok: true };
      // Protocolo duplicado: a denúncia já tinha sido enviada (ex.: migração em outra aba).
      if (result.error.code === "23505") return { ok: true };
      return { ok: false, offline: isOfflineError(result.error), error: result.error };
    } catch (error) {
      return { ok: false, offline: true, error: error };
    }
  }

  async function fetchReports() {
    const client = await ensureSupabase();
    if (!client) return loadReports();

    const result = await client
      .from("denuncias")
      .select("protocolo, criado_em, tipo, descricao, local")
      .order("criado_em", { ascending: false });

    if (result.error) throw result.error;

    return (result.data || []).map(function (row) {
      return {
        id: row.protocolo,
        data: row.criado_em,
        tipo: row.tipo,
        descricao: row.descricao,
        local: row.local,
      };
    });
  }

  async function deleteReport(report) {
    if (!supabase || !usingSupabase) return false;
    const result = await supabase
      .from("denuncias")
      .delete()
      .eq("protocolo", report.id);
    return !result.error;
  }

  // Envia para o banco as denúncias antigas do localStorage.
  // Só remove do dispositivo aquelas que foram gravadas com sucesso.
  async function migrateLocalReports() {
    const client = await ensureSupabase();
    if (!client || migrating) return;

    migrating = true;
    try {
      const reports = loadReports();
      if (!reports.length) return;

      const enviadas = [];
      for (let i = 0; i < reports.length; i += 1) {
        const result = await sendReport(reports[i]);
        if (result.ok) enviadas.push(reports[i].id);
      }
      if (enviadas.length) {
        // Relê a fila para não apagar denúncias adicionadas durante a migração.
        const atual = loadReports();
        saveReports(
          atual.filter(function (report) {
            return enviadas.indexOf(report.id) === -1;
          })
        );
      }
    } finally {
      migrating = false;
    }
  }

  /* ----------------------------------------------------------
     4. Controle genérico dos modais
     ---------------------------------------------------------- */
  let activeModal = null;
  let lastFocused = null;

  function firstVisibleFocusable(container) {
    const nodes = container.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    for (let i = 0; i < nodes.length; i += 1) {
      if (nodes[i].offsetParent !== null) return nodes[i];
    }
    return null;
  }

  function openModal(modalEl) {
    if (!modalEl) return;
    lastFocused = document.activeElement;
    activeModal = modalEl;
    modalEl.hidden = false;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(function () {
      const first = firstVisibleFocusable(modalEl);
      if (first) first.focus();
    });
  }

  function closeModal() {
    if (!activeModal) return;
    activeModal.hidden = true;
    activeModal = null;
    document.body.style.overflow = "";
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  }

  document
    .querySelectorAll("[data-close-modal], [data-close-access]")
    .forEach(function (button) {
      button.addEventListener("click", closeModal);
    });

  document.addEventListener("keydown", function (event) {
    if (!activeModal) return;

    if (event.key === "Escape") {
      closeModal();
      return;
    }

    // Mantém o foco dentro do modal aberto.
    if (event.key === "Tab") {
      const dialog = activeModal.querySelector(".modal__dialog");
      if (!dialog) return;
      const focusable = dialog.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const visible = Array.prototype.filter.call(focusable, function (el) {
        return el.offsetParent !== null;
      });
      if (!visible.length) return;

      const first = visible[0];
      const last = visible[visible.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  /* ----------------------------------------------------------
     5. Modal de denúncia
     ---------------------------------------------------------- */
  const reportModal = document.getElementById("report-modal");
  const reportForm = document.getElementById("report-form");
  const reportError = document.getElementById("report-error");
  const reportProtocol = document.getElementById("report-protocol");
  const reportSuccessNote = document.getElementById("report-success-note");
  const formView = reportModal && reportModal.querySelector('[data-report-view="form"]');
  const successView = reportModal && reportModal.querySelector('[data-report-view="success"]');

  function showReportView(view) {
    if (formView) formView.hidden = view !== "form";
    if (successView) successView.hidden = view !== "success";
  }

  function openReportModal() {
    showReportView("form");
    if (reportError) reportError.hidden = true;
    if (reportProtocol) reportProtocol.hidden = true;
    if (reportSuccessNote) reportSuccessNote.hidden = true;
    if (reportForm) reportForm.reset();
    openModal(reportModal);
  }

  document.querySelectorAll("[data-report]").forEach(function (trigger) {
    trigger.addEventListener("click", function () {
      closeMenu();
      openReportModal();
    });
  });

  if (reportForm) {
    reportForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const type = reportForm.querySelector("#report-type");
      const description = reportForm.querySelector("#report-description");
      const place = reportForm.querySelector("#report-place");
      const valid = type.value !== "" && description.value.trim().length > 0;

      if (!valid) {
        if (reportError) {
          reportError.textContent = "Preencha o tipo e a descrição para enviar.";
          reportError.hidden = false;
        }
        (type.value === "" ? type : description).focus();
        return;
      }

      if (reportError) reportError.hidden = true;

      const submitButton = reportForm.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;

      const report = {
        id: makeProtocol(),
        data: new Date().toISOString(),
        tipo: type.value,
        descricao: description.value.trim(),
        local: place && place.value.trim() ? place.value.trim() : "",
      };

      const result = await sendReport(report);
      if (submitButton) submitButton.disabled = false;

      let note = "";
      if (!result.ok) {
        if (result.offline) {
          // Sem rede: guarda no dispositivo e sincroniza quando a conexão voltar.
          const reports = loadReports();
          reports.unshift(report);
          saveReports(reports);
          note =
            "Sem conexão com o banco: sua denúncia ficou salva neste dispositivo e será enviada automaticamente.";
        } else {
          if (reportError) {
            reportError.textContent =
              "Não foi possível enviar sua denúncia. Tente novamente em instantes.";
            reportError.hidden = false;
          }
          return;
        }
      }

      if (reportProtocol) {
        reportProtocol.textContent = "Protocolo: " + report.id;
        reportProtocol.hidden = false;
      }
      if (reportSuccessNote) {
        reportSuccessNote.textContent = note;
        reportSuccessNote.hidden = !note;
      }

      reportForm.reset();
      showReportView("success");
      const successButton = successView && successView.querySelector("button");
      if (successButton) successButton.focus();
    });
  }

  /* ----------------------------------------------------------
     6. Área restrita — Auth do Supabase (ou senha no modo demo)
     ---------------------------------------------------------- */
  const accessModal = document.getElementById("access-modal");
  const accessForm = document.getElementById("access-form");
  const accessError = document.getElementById("access-error");
  const loginView = accessModal && accessModal.querySelector('[data-access-view="login"]');
  const listView = accessModal && accessModal.querySelector('[data-access-view="list"]');

  function isAuthenticated() {
    try {
      return sessionStorage.getItem(AUTH_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function setAuthenticated(value) {
    try {
      if (value) sessionStorage.setItem(AUTH_KEY, "1");
      else sessionStorage.removeItem(AUTH_KEY);
    } catch (error) {
      /* sessão indisponível */
    }
  }

  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.prototype.map
      .call(new Uint8Array(digest), function (byte) {
        return byte.toString(16).padStart(2, "0");
      })
      .join("");
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function showAccessError(message) {
    if (!accessError) return;
    accessError.textContent = message;
    accessError.hidden = false;
  }

  async function renderReports() {
    const listEl = document.getElementById("reports-list");
    const countEl = document.getElementById("reports-count");
    const errorEl = document.getElementById("reports-error");
    if (!listEl) return;

    if (errorEl) errorEl.hidden = true;

    let reports = [];
    let remote = false;

    try {
      if (usingSupabase) {
        reports = await fetchReports();
        remote = true;
      } else {
        reports = loadReports();
      }
    } catch (error) {
      if (errorEl) {
        errorEl.textContent =
          "Não foi possível carregar as denúncias: " + ((error && error.message) || "erro desconhecido");
        errorEl.hidden = false;
      }
    }

    if (countEl) {
      countEl.textContent =
        reports.length === 0
          ? remote
            ? "Nenhuma denúncia registrada no banco."
            : "Nenhuma denúncia registrada neste navegador."
          : reports.length === 1
          ? remote
            ? "1 denúncia registrada no banco."
            : "1 denúncia registrada neste navegador."
          : reports.length +
            (remote
              ? " denúncias registradas no banco."
              : " denúncias registradas neste navegador.");
    }

    listEl.textContent = "";

    if (!reports.length) {
      const empty = document.createElement("p");
      empty.className = "reports__empty";
      empty.textContent = remote
        ? "Ainda não há denúncias registradas."
        : "As denúncias enviadas aparecerão aqui.";
      listEl.appendChild(empty);
      return;
    }

    reports.forEach(function (report) {
      const card = document.createElement("article");
      card.className = "report";

      const head = document.createElement("div");
      head.className = "report__head";

      const protocol = document.createElement("span");
      protocol.className = "report__protocol";
      protocol.textContent = report.id || "—";

      const date = document.createElement("time");
      date.className = "report__date";
      if (report.data) date.dateTime = report.data;
      date.textContent = formatDate(report.data);

      head.appendChild(protocol);
      head.appendChild(date);
      card.appendChild(head);

      const type = document.createElement("h4");
      type.className = "report__type";
      type.textContent = report.tipo || "Não informado";
      card.appendChild(type);

      if (report.local) {
        const place = document.createElement("p");
        place.className = "report__place";
        place.textContent = "Local: " + report.local;
        card.appendChild(place);
      }

      const description = document.createElement("p");
      description.className = "report__desc";
      description.textContent = report.descricao || "";
      card.appendChild(description);

      const remove = document.createElement("button");
      remove.className = "report__delete";
      remove.type = "button";
      remove.textContent = "Excluir denúncia";
      remove.addEventListener("click", async function () {
        remove.disabled = true;

        if (remote) {
          const ok = await deleteReport(report);
          if (!ok) {
            remove.disabled = false;
            if (errorEl) {
              errorEl.textContent = "Não foi possível excluir a denúncia.";
              errorEl.hidden = false;
            }
            return;
          }
        } else {
          const current = loadReports();
          const index = current.findIndex(function (item) {
            return item.id === report.id;
          });
          if (index > -1) {
            current.splice(index, 1);
            saveReports(current);
          }
        }

        renderReports();
      });
      card.appendChild(remove);

      listEl.appendChild(card);
    });
  }

  function showAccessView(view) {
    if (loginView) loginView.hidden = view !== "login";
    if (listView) listView.hidden = view !== "list";
  }

  async function hasSession() {
    const client = await ensureSupabase();
    if (!client) return isAuthenticated();
    try {
      const result = await client.auth.getSession();
      return Boolean(result.data && result.data.session);
    } catch (error) {
      return isAuthenticated();
    }
  }

  async function openAccessModal() {
    closeMenu();
    if (!accessModal) return;
    if (accessError) accessError.hidden = true;
    if (accessForm) accessForm.reset();

    const loggedIn = await hasSession();
    if (loggedIn) {
      renderReports();
      showAccessView("list");
    } else {
      showAccessView("login");
    }

    openModal(accessModal);
  }

  document.querySelectorAll("[data-access]").forEach(function (trigger) {
    trigger.addEventListener("click", openAccessModal);
  });

  if (accessForm) {
    accessForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const emailInput = accessForm.querySelector("#access-email");
      const passwordInput = accessForm.querySelector("#access-password");
      const submitButton = accessForm.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      if (accessError) accessError.hidden = true;

      let unlocked = false;

      if (usingSupabase) {
        if (!emailInput || !emailInput.value.trim()) {
          showAccessError("Informe o e-mail da equipe.");
          if (emailInput) emailInput.focus();
          if (submitButton) submitButton.disabled = false;
          return;
        }
        try {
          const result = await supabase.auth.signInWithPassword({
            email: emailInput.value.trim(),
            password: passwordInput.value,
          });
          unlocked = !result.error;
          if (!unlocked) {
            showAccessError("E-mail ou senha incorretos. Tente novamente.");
          }
        } catch (error) {
          showAccessError("Não foi possível entrar. Verifique sua conexão.");
        }
      } else {
        try {
          unlocked = (await sha256(passwordInput.value)) === ACCESS_HASH;
        } catch (error) {
          unlocked = false;
        }
        if (!unlocked) showAccessError("Senha incorreta. Tente novamente.");
      }

      if (submitButton) submitButton.disabled = false;

      if (!unlocked) {
        passwordInput.focus();
        return;
      }

      setAuthenticated(true);
      renderReports();
      showAccessView("list");
      const firstButton = listView && listView.querySelector("button");
      if (firstButton) firstButton.focus();
    });
  }

  document.querySelectorAll("[data-logout]").forEach(function (button) {
    button.addEventListener("click", async function () {
      setAuthenticated(false);
      if (accessForm) accessForm.reset();
      if (accessError) accessError.hidden = true;
      showAccessView("login");

      if (supabase && usingSupabase) {
        try {
          await supabase.auth.signOut();
        } catch (error) {
          console.warn("Não foi possível encerrar a sessão:", error);
        }
      }

      const passwordInput = document.getElementById("access-password");
      if (passwordInput) passwordInput.focus();
    });
  });

  // Ajusta o formulário de acesso e dispara a migração das denúncias locais.
  function applyAccessMode() {
    const emailField = document.getElementById("access-email-field");
    const note = document.getElementById("access-mode-note");

    ensureSupabase().then(function (client) {
      if (client) {
        if (emailField) emailField.hidden = false;
        if (note) {
          note.textContent =
            "Entre com a conta da equipe cadastrada no Supabase Auth. As denúncias são lidas diretamente do banco.";
        }
        migrateLocalReports();
        return;
      }

      if (emailField) emailField.hidden = true;
      if (note) {
        note.textContent = SUPABASE_CONFIGURED
          ? "Banco indisponível no momento. Usando o modo demonstração neste navegador."
          : "Modo demonstração: as denúncias ficam salvas neste navegador.";
      }
    });
  }

  applyAccessMode();

  /* ----------------------------------------------------------
     7. PWA — instalação, modo offline e service worker
     ---------------------------------------------------------- */
  const installButton = document.getElementById("install-btn");
  let installPrompt = null;

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.hidden = false;
  });

  if (installButton) {
    installButton.addEventListener("click", async function () {
      if (!installPrompt) return;
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice && choice.outcome === "accepted") installButton.hidden = true;
      installPrompt = null;
    });
  }

  window.addEventListener("appinstalled", function () {
    if (installButton) installButton.hidden = true;
    installPrompt = null;
  });

  const offlineBadge = document.getElementById("offline-badge");

  function updateOnlineStatus() {
    if (offlineBadge) offlineBadge.hidden = navigator.onLine !== false;
  }

  window.addEventListener("online", function () {
    updateOnlineStatus();
    migrateLocalReports();
  });
  window.addEventListener("offline", updateOnlineStatus);
  updateOnlineStatus();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function (error) {
        console.warn("Não foi possível registrar o service worker:", error);
      });
    });
  }
})();
