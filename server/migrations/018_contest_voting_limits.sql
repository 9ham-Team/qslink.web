ALTER TABLE "contestVotes"
 DROP CONSTRAINT "contestVotes_slot_check",
 ADD CONSTRAINT "contestVotes_slot_check" CHECK (slot BETWEEN 1 AND 5),
 DROP CONSTRAINT "contestVotes_eventKey_voterKey_voteDate_key";
