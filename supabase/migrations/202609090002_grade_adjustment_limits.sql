begin;

alter table public.grade_adjustments
  drop constraint if exists grade_adjustments_section_score_limits_check;

alter table public.grade_adjustments
  add constraint grade_adjustments_section_score_limits_check check (
    previous_grade > 0
    and new_grade > 0
    and case grade_section
      when 'تحريري' then previous_grade < 50 and new_grade < 50
      when 'شفوي' then previous_grade < 20 and new_grade < 20
      when 'واجبات' then previous_grade < 20 and new_grade < 20
      when 'مواظبة' then previous_grade < 10 and new_grade < 10
      else false
    end
  ) not valid;

commit;
