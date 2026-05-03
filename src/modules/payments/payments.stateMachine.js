import { AppError } from '../../shared/errors/AppError.js';

export const TRANSITIONS = {
  pending_approval:          ['processing', 'pending_compliance', 'pending_manual_processing', 'rejected', 'cancelled'],
  pending_compliance:        ['processing', 'pending_manual_processing', 'rejected', 'cancelled'],
  pending_manual_processing: ['completed', 'failed', 'cancelled'],
  processing:                ['completed', 'failed'],
  completed:                 [],
  failed:                    [],
  rejected:                  [],
  cancelled:                 [],
};

export const assertTransition = (from, to) => {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new AppError(
      'INVALID_STATE',
      `Cannot transition payment from '${from}' to '${to}'`,
      422,
    );
  }
};
