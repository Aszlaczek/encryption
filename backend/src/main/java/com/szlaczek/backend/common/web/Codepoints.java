package com.szlaczek.backend.common.web;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** Limits a string by Unicode code points rather than UTF-16 code units. */
@Documented
@Constraint(validatedBy = CodepointsValidator.class)
@Target({ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface Codepoints {

    int max();

    String message() default "Przekroczono limit punktów kodowych.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
