CREATE TABLE IF NOT EXISTS public.denuncias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo text NOT NULL UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  tipo text NOT NULL,
  descricao text NOT NULL,
  local text NOT NULL DEFAULT '',

  CONSTRAINT denuncias_tipo_check CHECK (
    lower(tipo) IN (
      'bullying escolar',
      'cyberbullying',
      'abuso sexual',
      'violência psicológica',
      'assédio',
      'outro'
    )
  ),

  CONSTRAINT denuncias_descricao_check CHECK (
    char_length(btrim(descricao)) > 0
    AND char_length(descricao) <= 5000
  )
);

CREATE INDEX IF NOT EXISTS denuncias_criado_em_idx
ON public.denuncias (criado_em DESC);

ALTER TABLE public.denuncias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
"qualquer pessoa pode enviar denuncia"
ON public.denuncias;

CREATE POLICY "qualquer pessoa pode enviar denuncia"
ON public.denuncias
FOR INSERT
TO anon
WITH CHECK (true);

REVOKE ALL ON public.denuncias FROM anon, authenticated;

GRANT INSERT ON public.denuncias TO anon;