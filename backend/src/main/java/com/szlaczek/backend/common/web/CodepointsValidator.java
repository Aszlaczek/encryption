package com.szlaczek.backend.common.web;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/** Validator for {@link Codepoints}. */
public class CodepointsValidator implements ConstraintValidator<Codepoints, CharSequence> {

    private int max;

    @Override
    public void initialize(Codepoints constraintAnnotation) {
        max = constraintAnnotation.max();
    }

    @Override
    public boolean isValid(CharSequence value, ConstraintValidatorContext context) {
        return value == null || value.toString().codePointCount(0, value.length()) <= max;
    }
}
