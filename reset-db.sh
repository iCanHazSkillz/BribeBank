#!/bin/bash

echo "Resetting bribebank database..."

sudo docker exec bribebank-db psql -U bribebank -d bribebank <<EOF
TRUNCATE TABLE "AssignedPrize" CASCADE;
TRUNCATE TABLE "AssignedBounty" CASCADE;
TRUNCATE TABLE "PrizeTemplate" CASCADE;
TRUNCATE TABLE "BountyTemplate" CASCADE;
TRUNCATE TABLE "HistoryEvent" CASCADE;
TRUNCATE TABLE "Family" CASCADE;
TRUNCATE TABLE "User" CASCADE;
EOF

echo "Database wipe complete."
