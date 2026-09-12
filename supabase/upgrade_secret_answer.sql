-- Add secret_answer column to profiles for account recovery
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS secret_answer text default '';

-- Update the trigger to also capture secret_answer from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
begin
  insert into public.profiles (id, full_name, role, username, sitio, barangay, municipality, province, secret_question, secret_answer)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'customer'),
    coalesce(new.raw_user_meta_data ->> 'username', ''),
    coalesce(new.raw_user_meta_data ->> 'sitio', ''),
    coalesce(new.raw_user_meta_data ->> 'barangay', ''),
    coalesce(new.raw_user_meta_data ->> 'municipality', ''),
    coalesce(new.raw_user_meta_data ->> 'province', ''),
    coalesce(new.raw_user_meta_data ->> 'secret_question', ''),
    coalesce(new.raw_user_meta_data ->> 'secret_answer', '')
  );
  return new;
end;
$$;
