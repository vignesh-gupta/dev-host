# Steps to run RDS locally

1. Create a new RDS instance using floci UI

2. Verify the RDS instance is running by
```sh
aws rds describe-db-instances --endpoint-url http://localhost:4566 --query "DBInstances[].{id:DBInstanceIdentifier,status:DBInstanceStatus,engine:Engine,port:Endpoint.Port}" --output table
```

3. Get the RDS container name from docker ps with word rds in it:
```sh
docker ps --filter name=floci-rds-db --format "{{.Names}}"
```

4. Check it's IP:
```sh
docker ps --filter name=floci-rds-db --format "{{.Names}}"
docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" <that-container-name-from-step-3>
```


5. Publish it to your machine
```sh
docker rm -f pg-forward
docker run -d --name pg-forward -p 7001:5432 alpine/socat tcp-listen:5432,fork,reuseaddr tcp:<IP-from-step-2>:5432
```

6. Test a real login
```sh
docker run --rm -it postgres:18.6-alpine psql "postgresql://root:<password>@host.docker.internal:7001/postgres?sslmode=disable" -c "\l"
```


----------- 


To Test if the RDS service is running on localhost, you can use the following PowerShell command:

```powershell
Test-NetConnection localhost -Port 7001
```

## Combined script

```sh
docker rm -f pg-forward 2>/dev/null || true
docker ps --filter name=floci-rds-db --format "{{.Names}}" \
	| xargs -r -I {} sh -c 'docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" "$1"' _ {} \
	| xargs -r -I {} docker run -d --name pg-forward -p 7001:5432 alpine/socat tcp-listen:5432,fork,reuseaddr tcp:{}:5432

docker run --rm -it postgres:18.6-alpine \
	psql "postgresql://root:${RDS_PASSWORD}@host.docker.internal:7001/postgres?sslmode=disable" -c "\\l"
```

## Testing SSR deployments with floci

Start floci and register the builder task with
`LAMBDA_EXECUTION_ROLE_ARN=arn:aws:iam::000000000000:role/local-lambda-role`.
Deploy a Next.js project with the default server-rendered output or with
`next.config.*` using `output: "standalone"`. Neither setting is required for
OpenNext; only `output: "export"` selects the static deployment path.
The builder packages the OpenNext server output, creates a Lambda function and
Function URL at the floci endpoint, and reports the URL to the web app. The
preview server then routes that project's requests to the Function URL.

Static projects and Next.js projects using `output: "export"` continue to use
the S3 output path.

For a local task registration, export the required values before running
`scripts/register-task.sh`:

```sh
export LAMBDA_EXECUTION_ROLE_ARN=arn:aws:iam::000000000000:role/local-lambda-role
export AWS_ACCOUNT_ID=000000000000
export AWS_BUCKET_NAME=simple-vercel-output
```

The builder uses `AWS_ENDPOINT_URL` for both S3 and Lambda. Confirm the Lambda
function and Function URL with floci's AWS-compatible CLI after a deployment.
When the returned local Function URL uses a `*.lambda-url.*.localhost`
hostname, set `LAMBDA_PROXY_ENDPOINT=http://localhost:4566` for the preview
server. The proxy connects to floci through that endpoint while preserving the
Function URL host header for Lambda URL routing.
