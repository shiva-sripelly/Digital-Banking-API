// FastAPI returns `detail` as a string, as {code, message}, or (validation
// errors) as an array of objects. Rendering an object directly crashes React.
export function getErrorMessage(err, fallback = "Something went wrong") {
  const detail = err?.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg.replace(/^Value error, /, "")).join(", ");
  }

  if (typeof detail === "string") {
    return detail;
  }

  if (detail && typeof detail.message === "string") {
    return detail.message;
  }

  if (!err?.response) {
    return "Cannot reach the server. Is the backend running?";
  }

  return fallback;
}

export function getErrorCode(err) {
  const detail = err?.response?.data?.detail;
  return detail && typeof detail === "object" && !Array.isArray(detail) ? detail.code : undefined;
}

// Maps FastAPI 422 validation errors to { fieldName: message }.
export function getFieldErrors(err) {
  const detail = err?.response?.data?.detail;
  if (!Array.isArray(detail)) return {};

  return detail.reduce((errors, item) => {
    const field = item.loc?.[item.loc.length - 1];
    if (field && !errors[field]) {
      errors[field] = item.msg.replace(/^Value error, /, "");
    }
    return errors;
  }, {});
}
