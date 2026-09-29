begin;
alter table public.grade_adjustments
  add column if not exists assessment_period text not null default 'الفترة الأولى',
  add column if not exists grade_section text not null default 'تحريري';
alter table public.grade_adjustments drop constraint if exists grade_adjustments_adjustment_month_check;
alter table public.grade_adjustments add constraint grade_adjustments_adjustment_month_check check (adjustment_month in ('محرم (يوليو)','صفر (أغسطس)','نهاية الفصل الأول','جمادى الأولى (نوفمبر)','جمادى الآخرة (ديسمبر)','نهاية الفصل الثاني'));
alter table public.grade_adjustments add constraint grade_adjustments_assessment_period_check check (assessment_period in ('الفترة الأولى','الفترة الثانية','الفترة الثالثة'));
alter table public.grade_adjustments add constraint grade_adjustments_grade_section_check check (grade_section in ('تحريري','شفوي','واجبات','مواظبة'));
create or replace function public.protect_grade_adjustment_dimensions() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.current_user_role() = 'computer_unit' and (new.assessment_period is distinct from old.assessment_period or new.grade_section is distinct from old.grade_section) then
    raise exception 'Computer unit may update workflow only' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists protect_grade_adjustment_dimensions_trigger on public.grade_adjustments;
create trigger protect_grade_adjustment_dimensions_trigger before update on public.grade_adjustments for each row execute function public.protect_grade_adjustment_dimensions();
revoke all on function public.protect_grade_adjustment_dimensions() from public,anon;
grant execute on function public.protect_grade_adjustment_dimensions() to authenticated,service_role;
commit;
