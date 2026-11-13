export type FieldViolation = {
  field: string;
  code: string;
  message: string;
};

/** RFC 9457 problem details returned by the backend for every API error. */
export type ApiProblem = {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  instance: string;
  traceId: string;
  errors?: FieldViolation[];
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly problem?: ApiProblem;
  readonly fieldErrors: FieldViolation[];
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    code: string,
    detail: string,
    options: {
      problem?: ApiProblem;
      fieldErrors?: FieldViolation[];
      retryAfterSeconds?: number;
    } = {},
  ) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.problem = options.problem;
    this.fieldErrors = options.fieldErrors ?? [];
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  static fromProblem(
    status: number,
    problem: ApiProblem | undefined,
    retryAfterSeconds?: number,
  ): ApiError {
    return new ApiError(
      status,
      problem?.code ?? 'UNKNOWN_ERROR',
      problem?.detail ?? 'Wystąpił błąd.',
      {
        problem,
        fieldErrors: problem?.errors ?? [],
        retryAfterSeconds,
      },
    );
  }
}
