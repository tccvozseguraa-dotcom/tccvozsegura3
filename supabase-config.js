/* ============================================================
   Voz Segura — configuração do Supabase

   1. Crie um projeto em https://supabase.com/dashboard/new
   2. Execute o arquivo supabase/schema.sql no SQL Editor do projeto.
   3. Cadastre os usuários da equipe em Authentication > Users.
   4. Cole abaixo a URL do projeto e a chave "anon" / publishable
      (Project Settings > API). NUNCA coloque a chave service_role
      aqui: este arquivo é público e vai para o navegador.

   Deixando os campos vazios, o site continua funcionando no modo
   demonstração (denúncias salvas apenas neste navegador).
   ============================================================ */
window.VOZSEGURA_SUPABASE = {
  url: "https://dpupvwhzwrhlqzyfzads.supabase.co",
  anonKey: "sb_publishable_QRIzzcZbTuwiCDPPbx5k4w_yFDmRSY2",
};
