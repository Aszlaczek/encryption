package com.szlaczek.backend.common.web;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** Limits a string by its UTF-8 byte length, which is what the API contract specifies for passwords. */
@Documented
@Constraint(validatedBy = Utf8BytesValidator.class)
@Target({ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface Utf8Bytes {

    int max();

    String message() default "Przekroczono limit bajtów UTF-8.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
