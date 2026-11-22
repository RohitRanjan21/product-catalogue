import { EnquiryRequestSchema, type EnquiryRequest } from '@catalogue/contracts';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { useSubmitEnquiry } from '../api/hooks';

type Field = 'name' | 'email' | 'phone' | 'message';
type FieldErrors = Partial<Record<Field, string>>;

const FIELDS: readonly Field[] = ['name', 'email', 'phone', 'message'];
const MESSAGE_MAX = 1000;

interface Props {
  productId: number;
  onCancel: () => void;
}

/**
 * Validates with the same schema the API uses, so the customer sees field errors before sending.
 * The API still validates; its field errors are shown the same way if they ever disagree.
 */
export function EnquiryForm({ productId, onCancel }: Props) {
  const submit = useSubmitEnquiry();
  const [values, setValues] = useState<Record<Field, string>>({ name: '', email: '', phone: '', message: '' });
  const [errors, setErrors] = useState<FieldErrors>({});

  if (submit.isSuccess) {
    return (
      <div className="notice notice--success" role="status">
        <h2>Thank you</h2>
        <p>Your enquiry has been sent to our sales team. They will reply to {submit.variables.email}.</p>
        <p className="muted">Reference: {submit.data.enquiryId}</p>
      </div>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = EnquiryRequestSchema.safeParse(toRequest(productId, values));
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
      return;
    }
    setErrors({});
    submit.mutate(parsed.data, {
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') setErrors(toFieldErrors(error.details));
      },
    });
  }

  const formError = formErrorFor(submit.error);

  const fieldProps = (field: Field) => ({
    id: `enquiry-${field}`,
    name: field,
    value: values[field],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [field]: event.target.value })),
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `enquiry-${field}-error` : undefined,
  });

  return (
    <form className="form" onSubmit={handleSubmit} noValidate aria-labelledby="enquiry-heading">
      <h2 id="enquiry-heading">Enquire about this product</h2>
      {formError && (
        <p className="notice notice--error" role="alert">
          {formError}
        </p>
      )}
      <div className="form__field">
        <label htmlFor="enquiry-name">Name</label>
        <input {...fieldProps('name')} autoComplete="name" maxLength={100} required />
        <FieldError field="name" errors={errors} />
      </div>
      <div className="form__field">
        <label htmlFor="enquiry-email">Email</label>
        <input {...fieldProps('email')} type="email" autoComplete="email" maxLength={254} required />
        <FieldError field="email" errors={errors} />
      </div>
      <div className="form__field">
        <label htmlFor="enquiry-phone">
          Phone <span className="form__hint">(optional)</span>
        </label>
        <input {...fieldProps('phone')} type="tel" autoComplete="tel" maxLength={20} />
        <FieldError field="phone" errors={errors} />
      </div>
      <div className="form__field">
        <label htmlFor="enquiry-message">
          Message <span className="form__hint">(optional, up to {MESSAGE_MAX} characters)</span>
        </label>
        <textarea {...fieldProps('message')} rows={5} maxLength={MESSAGE_MAX} />
        <FieldError field="message" errors={errors} />
      </div>
      <div className="form__actions">
        <button className="button" type="submit" disabled={submit.isPending}>
          {submit.isPending ? 'Sending…' : 'Send enquiry'}
        </button>
        <button className="button button--secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function FieldError({ field, errors }: { field: Field; errors: FieldErrors }) {
  if (!errors[field]) return null;
  return (
    <span id={`enquiry-${field}-error`} className="form__error">
      {errors[field]}
    </span>
  );
}

/** Empty optional fields are left out: the contract treats "" as invalid, not as "not given". */
function toRequest(productId: number, values: Record<Field, string>): Partial<EnquiryRequest> {
  const phone = values.phone.trim();
  const message = values.message.trim();
  return {
    productId,
    name: values.name,
    email: values.email,
    ...(phone ? { phone } : {}),
    ...(message ? { message } : {}),
  };
}

/** Errors not tied to a field: provider down, rate limited, product gone. Field errors show inline. */
function formErrorFor(error: unknown): string | undefined {
  if (!error) return undefined;
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (error.code === 'VALIDATION_ERROR') {
    if (Object.keys(toFieldErrors(error.details)).length > 0) return undefined;
    return error.details[0]?.message ?? error.message;
  }
  return error.message;
}

function toFieldErrors(issues: { path: string; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const { path, message } of issues) {
    const field = FIELDS.find((f) => f === path);
    if (field && !errors[field]) errors[field] = message;
  }
  return errors;
}
