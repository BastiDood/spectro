import { env } from '$env/dynamic/private';

export const { OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_TOKEN } = env;
