package com.szlaczek.backend.common.web;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.nio.charset.StandardCharsets;

/** {@link Utf8Bytes} validator. {@code null} is left to other constraints such as {@code @NotBlank}. */
public class Utf8BytesValidator implements ConstraintValidator<Utf8Bytes, CharSequence> {

    private int max;

    @Override
    public void initialize(Utf8Bytes constraintAnnotation) {
        this.max = constraintAnnotation.max();
    }

    @Override
    public boolean isValid(CharSequence value, ConstraintValidatorContext context) {
        if (value == null) {
            return true;
        }

        return value.toString().getBytes(StandardCharsets.UTF_8).length <= max;
    }
}
