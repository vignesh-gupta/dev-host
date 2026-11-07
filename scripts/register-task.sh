eval $(floci env)

aws ecs register-task-definition \
  --endpoint-url http://localhost:4566 \
  --family builder-server-task \
  --network-mode bridge \
  --container-definitions '[{
    "name": "builder-server",
    "image": "localhost:5100/builder-server:latest",
    "memory": 3072,
    "cpu": 1024,
    "environment": [
      {"name": "AWS_ACCESS_KEY_ID", "value": "'"$AWS_ACCESS_KEY_ID"'"},
      {"name": "AWS_SECRET_ACCESS_KEY", "value": "'"$AWS_SECRET_ACCESS_KEY"'"},
      {"name": "AWS_REGION", "value": "us-east-1"},
      {"name": "AWS_ENDPOINT_URL", "value": "'"${AWS_ENDPOINT_URL:-http://host.docker.internal:4566}"'"},
      {"name": "AWS_BUCKET_NAME", "value": "'"${AWS_BUCKET_NAME:-simple-vercel-output}"'"},
      {"name": "LAMBDA_EXECUTION_ROLE_ARN", "value": "'"${LAMBDA_EXECUTION_ROLE_ARN:-arn:aws:iam::000000000000:role/local-lambda-role}"'"},
      {"name": "LAMBDA_S3_BUCKET", "value": "'"${AWS_BUCKET_NAME:-simple-vercel-output}"'"},
      {"name": "AWS_ACCOUNT_ID", "value": "'"${AWS_ACCOUNT_ID:-000000000000}"'"},
      {"name": "GIT_PAT_TOKEN", "value": "'"$GIT_PAT_TOKEN"'"},
      {"name": "REDIS_URL", "value": "'"$REDIS_URL"'"},
      {"name": "WEB_BASE_URL", "value": "'"${WEB_BASE_URL:-http://host.docker.internal:3000}"'"},
      {"name": "BUILDER_CALLBACK_TOKEN", "value": "'"${BUILDER_CALLBACK_TOKEN:-test}"'"}
    ]
  }]'
