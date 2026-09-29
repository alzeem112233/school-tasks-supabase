begin;

alter table public.grade_adjustments
  alter column previous_grade drop not null;

alter table public.grade_adjustments
  drop constraint if exists grade_adjustments_section_score_limits_check;

alter table public.grade_adjustments
  add constraint grade_adjustments_section_score_limits_check check (
    new_grade > 0
    and case grade_section
      when 'تحريري' then new_grade < 50 and (previous_grade is null or (previous_grade > 0 and previous_grade < 50))
      when 'شفوي' then new_grade < 20 and (previous_grade is null or (previous_grade > 0 and previous_grade < 20))
      when 'واجبات' then new_grade < 20 and (previous_grade is null or (previous_grade > 0 and previous_grade < 20))
      when 'مواظبة' then new_grade < 10 and (previous_grade is null or (previous_grade > 0 and previous_grade < 10))
      else false
    end
  ) not valid;

commit;
