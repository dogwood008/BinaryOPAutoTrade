#!/bin/sh
docker container run \
  -it \
  --rm \
  -p 3000:3000 \
  --env USER_ID=$USER_ID \
  --env PASSWORD=$PASSWORD \
  --security-opt seccomp=$(pwd)/chrome.json \
  dogwood008/binary_op_auto_trade:latest
