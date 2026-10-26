/*
|--------------------------------------------------------------------------
| Matching Request Completion
|--------------------------------------------------------------------------
|
| COMPLETED means a successfully accepted professional conversation
| has ended normally.
|
*/

ALTER TABLE matching_requests
DROP CONSTRAINT IF EXISTS matching_requests_status_check;

ALTER TABLE matching_requests
ADD CONSTRAINT matching_requests_status_check
CHECK (
    status IN (
        'WAITING',
        'MATCHED',
        'ACCEPTED',
        'COMPLETED',
        'CANCELLED',
        'EXPIRED'
    )
);