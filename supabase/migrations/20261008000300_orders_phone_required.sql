-- Phase U: a phone number is required on every new order (the salon confirms each order by phone / WhatsApp).
-- place_order() stores an empty p_phone as null, so a null phone is what this refuses (23514, check_violation;
-- POST /api/orders refuses it first, with field "phone"). NOT VALID: older guest orders without a number stay
-- as they are; every insert and update from now on is checked. The format is still checked by phone_normalize.
alter table public.orders
  add constraint orders_phone_required check (phone is not null) not valid;
