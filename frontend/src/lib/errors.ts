export const getErrorMessage = (codeOrMessage: string): string => {
  const errorMap: Record<string, string> = {
    'INVALID_CREDENTIALS': 'The email or password you entered is incorrect.',
    'EMAIL_ALREADY_EXISTS': 'This email address is already registered.',
    'STALE_VERSION': 'This task was modified by another user. Please refresh.',
    'LAST_OWNER_PROTECTION': 'Cannot remove the last owner of the workspace.',

    // Workspace & Members Hataları:
    'Bu kullanıcı zaten bu workspace\'in üyesi.': 'This user is already a member of this workspace.',
    'Bu e-posta adresine sahip bir kullanıcı sistemde bulunamadı.': 'No user found with this email address.',
    'Bu işlem için yetkiniz yok.': 'You do not have permission to perform this action.',
  };

  return errorMap[codeOrMessage] || codeOrMessage || 'An unexpected error occurred. Please try again.';
};