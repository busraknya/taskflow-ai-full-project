export const getErrorMessage = (codeOrMessage: string): string => {
  const errorMap: Record<string, string> = {
    'INVALID_CREDENTIALS': 'The email or password you entered is incorrect.',
    'EMAIL_ALREADY_EXISTS': 'This email address is already registered.',
    'STALE_VERSION': 'This task was modified by another user. Please refresh.',
    'LAST_OWNER_PROTECTION': 'Cannot remove the last owner of the workspace.',
  };

  return errorMap[codeOrMessage] || codeOrMessage || 'An unexpected error occurred. Please try again.';
};