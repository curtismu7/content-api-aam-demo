#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  # shellcheck disable=SC1091
  source .env
fi

: "${PG_AAM_SERVICE_URL:?Set PG_AAM_SERVICE_URL (PingOne console: Authorization > API Gateways > Service URL)}"
: "${AAM_GATEWAY_SECRET:?Set AAM_GATEWAY_SECRET (PingOne console: Authorization > API Gateways > Credentials)}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "Building images..."
docker build -f content-api/Dockerfile -t "${IMAGE_REGISTRY}content-api-aam-demo-content-api:${IMAGE_TAG}" .
docker build -f demo-page/Dockerfile -t "${IMAGE_REGISTRY}content-api-aam-demo-demo-page:${IMAGE_TAG}" .

if [ -n "$IMAGE_REGISTRY" ]; then
  echo "Pushing images to $IMAGE_REGISTRY..."
  docker push "${IMAGE_REGISTRY}content-api-aam-demo-content-api:${IMAGE_TAG}"
  docker push "${IMAGE_REGISTRY}content-api-aam-demo-demo-page:${IMAGE_TAG}"
fi

echo "Applying namespace..."
kubectl apply -f k8s/00-namespace.yaml

echo "Applying config and secret..."
PG_AAM_SERVICE_URL="$PG_AAM_SERVICE_URL" envsubst < k8s/01-configmap.yaml | kubectl apply -f -
AAM_GATEWAY_SECRET="$AAM_GATEWAY_SECRET" envsubst < k8s/02-secret.yaml | kubectl apply -f -

echo "Generating ping-gateway route ConfigMap from source..."
kubectl create configmap ping-gateway-routes \
  --namespace content-api-aam-demo \
  --from-file=config.json=ping-gateway/config/config.json \
  --from-file=aam-content-access.json=ping-gateway/config/routes/aam-content-access.json \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Applying deployments and services..."
IMAGE_REGISTRY="$IMAGE_REGISTRY" IMAGE_TAG="$IMAGE_TAG" envsubst < k8s/10-content-api.yaml | kubectl apply -f -
kubectl apply -f k8s/20-ping-gateway.yaml
IMAGE_REGISTRY="$IMAGE_REGISTRY" IMAGE_TAG="$IMAGE_TAG" envsubst < k8s/30-demo-page.yaml | kubectl apply -f -

echo "Done. Check status with: kubectl get pods -n content-api-aam-demo"
