# Voz Segura

Protótipo de uma plataforma de acolhimento e denúncia anônima contra bullying, abuso e
violência. Reconstruído a partir do protótipo do Figma (`figma1.mhtml`) como um site
estático, separado em HTML, CSS e JavaScript.

## Arquivos

| Arquivo      | Descrição                                                        |
| ------------ | ---------------------------------------------------------------- |
| `index.html`           | Estrutura semântica da página (cabeçalho, seções, rodapé e modais) |
| `styles.css`           | Estilos organizados por variáveis, componentes e responsividade    |
| `script.js`            | Interações, integração Supabase, área restrita e service worker    |
| `supabase-config.js`   | URL e chave anon do projeto Supabase (preencher)                   |
| `supabase/schema.sql`  | Tabela `denuncias`, índice e políticas de RLS                      |
| `manifest.webmanifest` | Metadados de instalação do PWA (nome, cores, ícones)              |
| `sw.js`                | Service worker: cache offline do "app shell"                       |
| `icons/`               | Ícones PNG (192, 512, maskable e Apple Touch)                      |

## Como abrir

Basta abrir o `index.html` no navegador. Não há dependências nem build.
Para usar os recursos de **PWA** (instalação e offline), é necessário servir por
`localhost` ou HTTPS — service workers não funcionam em `file://`.

Para servir localmente:

```bash
python3 -m http.server 8000
# depois acesse http://localhost:8000
```

## Funcionalidades

- Layout responsivo (mobile, tablet e desktop).
- Menu hambúrguer no mobile.
- Rolagem suave entre as seções com destaque do link ativo.
- Animações de entrada das seções (respeitando `prefers-reduced-motion`).
- Modal de denúncia anônima com validação e tela de confirmação.
- Contatos de emergência clicáveis (`tel:`).
- Denúncias enviadas ao **Supabase** com número de protocolo e data.
- Migração automática das denúncias antigas do `localStorage` para o banco.
- **Área da Equipe**: login real via Supabase Auth para consultar/excluir denúncias.
- **PWA**: instalável na tela inicial, funciona offline e avisa quando a conexão cai.
  Sem rede, a denúncia fica na fila local e é enviada quando a conexão volta.

## Banco de dados (Supabase)

O site funciona sem configuração, no **modo demonstração** (denúncias só no
`localStorage`). Para gravar no Supabase:

1. Crie um projeto em <https://supabase.com/dashboard/new>.
2. Abra o **SQL Editor** do projeto e execute todo o conteúdo de
   `supabase/schema.sql`. Isso cria a tabela `denuncias` com as colunas usadas
   pelo formulário:

   | Coluna      | Tipo        | Origem no site                          |
   | ----------- | ----------- | --------------------------------------- |
   | `id`        | `uuid`      | chave primária gerada pelo banco        |
   | `protocolo` | `text`      | `VZ-...` gerado no navegador            |
   | `criado_em` | `timestamptz` | data/hora do envio                    |
   | `tipo`      | `text`      | campo "Tipo de violência"               |
   | `descricao` | `text`      | campo "Conte o que aconteceu"           |
   | `local`     | `text`      | campo "Onde aconteceu?" (pode ser vazio)|

3. Cadastre os membros da equipe em **Authentication → Users → Add user**
   (ou pelo provider de sua preferência). Eles usarão e-mail + senha na
   Área da Equipe.
4. Em **Project Settings → API**, copie a **Project URL** e a chave
   **anon / publishable** e preencha `supabase-config.js`:

   ```js
   window.VOZSEGURA_SUPABASE = {
     url: "https://abcdefgh.supabase.co",
     anonKey: "eyJhbGciOi...",
   };
   ```

5. Recarregue a página. As denúncias já presentes no `localStorage` são
   enviadas automaticamente uma vez e removidas do dispositivo após o
   sucesso. Se alguma falhar, permanece na fila e é reenviada ao ficar
   online.

> **Nunca** coloque a chave `service_role` em `supabase-config.js` nem em
> qualquer arquivo entregue ao navegador. A chave anon é pública por design;
> a segurança vem das políticas de RLS do `schema.sql`: visitantes só podem
> **inserir**, a equipe autenticada pode **ler e excluir**.

A biblioteca `@supabase/supabase-js` é carregada do jsDelivr sob demanda.
Se o CDN estiver indisponível, o site cai automaticamente para o modo local.

## PWA (instalação e offline)

- `manifest.webmanifest` define nome, cores, ícone e `display: standalone` — o app
  abre sem a barra do navegador quando instalado.
- `sw.js` guarda o "app shell" (HTML, CSS, JS, manifesto e ícones) em cache. A
  navegação tenta a rede primeiro e cai para a página salva quando não há conexão.
- O botão **Instalar app** aparece no cabeçalho quando o navegador oferece o
  prompt de instalação (some no celular, onde o menu do navegador já faz isso).
- Um aviso vermelho no topo informa quando o dispositivo está offline.

### Como testar

1. Sirva em `http://localhost:8000` e abra no Chrome/Edge.
2. Aguarde o carregamento e recarregue uma vez para o service worker assumir o controle.
3. No DevTools → **Application → Service Workers**, confirme que está ativado.
4. Desmarque "Update on reload", vá em **Application → Manifest → Install app** ou
   use o botão "Instalar app" para testar a instalação.
5. Em **Network → Offline**, recarregue a página: o conteúdo continua disponível.

> Ao alterar HTML/CSS/JS, incremente a versão em `CACHE_NAME` em `sw.js` (ex.:
> `vozsegura-v2`) para forçar a atualização do cache nos dispositivos já instalados.

## Área da Equipe (acesso restrito)

O botão **Área da Equipe** existe no cabeçalho e no rodapé.

- **Com Supabase configurado:** o modal pede **e-mail e senha** de um usuário
  cadastrado no Supabase Auth. A sessão é mantida pelo próprio Supabase e a
  listagem/exclusão vem diretamente da tabela `denuncias` (protegida por RLS).
- **Sem Supabase configurado:** mantém-se o modo demonstração, com a senha
  local abaixo e consulta apenas das denúncias deste navegador.

### Senha do modo demonstração

```
vozsegura2024
```

A senha **não** aparece em texto puro no código: `script.js` guarda apenas o hash
SHA-256 dela na constante `ACCESS_HASH`.

### Como trocar a senha do modo demonstração

1. Escolha a nova senha e calcule o hash no console do navegador:

   ```js
   const bytes = new TextEncoder().encode("sua-nova-senha");
   const hash = await crypto.subtle.digest("SHA-256", bytes);
   console.log(
     Array.from(new Uint8Array(hash))
       .map((b) => b.toString(16).padStart(2, "0"))
       .join("")
   );
   ```

2. Substitua o valor de `ACCESS_HASH` em `script.js` pelo hash impresso.
3. Atualize a senha documentada aqui.

> A verificação da senha demo usa a Web Crypto API (`crypto.subtle`), disponível
> em contexto seguro: `file://`, `localhost` ou `https`. Para credenciais reais,
> use sempre o Supabase Auth — nunca uma senha fixa no código.

## Observações

O protótipo original do Figma foi capturado apenas na tela inicial; os botões de
denúncia viraram um modal funcional. Com o Supabase configurado, os dados trafegam
entre o navegador e o banco com a chave anon, e o acesso à equipe é controlado pelo
Supabase Auth + RLS. Sem configuração, tudo continua apenas no `localStorage` e a
senha local é uma **proteção demonstrativa** (qualquer pessoa com acesso ao código
pode burlá-la). Antes de publicar, confirme no painel do Supabase que:
**Authentication → Providers → Email** está ativo, as políticas de RLS estão
aplicadas e o domínio do site está liberado em **Authentication → URL Configuration**.
