CREATE OR REPLACE FUNCTION public.enforce_user_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
  cap CONSTANT INTEGER := 5;
BEGIN
  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count >= cap THEN
    RAISE EXCEPTION 'Signup restricted: this app is limited to % users.', cap
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_user_cap_trigger ON auth.users;
CREATE TRIGGER enforce_user_cap_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_cap();