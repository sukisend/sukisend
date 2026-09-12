-- Account Recovery Functions
-- Run in Supabase SQL Editor

-- Step 1: Verify username exists, return profile info
CREATE OR REPLACE FUNCTION public.verify_username_for_recovery(p_username text)
RETURNS TABLE(profile_id uuid, secret_question text, birthdate date)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.secret_question, p.birthdate
  FROM public.profiles p
  WHERE lower(p.username) = lower(p_username)
    AND p.role = 'customer';
END;
$$;

-- Step 3: Verify secret answer
CREATE OR REPLACE FUNCTION public.verify_secret_answer(p_profile_id uuid, p_answer text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_profile_id
      AND lower(secret_answer) = lower(p_answer)
  );
END;
$$;

-- Step 4: Reset password (must be SECURITY DEFINER to update auth.users)
CREATE OR REPLACE FUNCTION public.reset_password_by_secret(
  p_profile_id uuid,
  p_birthdate date,
  p_secret_answer text,
  p_new_password text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;

  IF v_profile IS NULL THEN
    RETURN 'Account not found';
  END IF;

  IF v_profile.birthdate IS DISTINCT FROM p_birthdate THEN
    RETURN 'Birthdate does not match';
  END IF;

  IF lower(v_profile.secret_answer) != lower(p_secret_answer) THEN
    RETURN 'Secret answer is incorrect';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf'))
  WHERE id = p_profile_id;

  RETURN NULL;
END;
$$;
