import helmet from '@fastify/helmet';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

// No CORS on purpose: only alimentos-backend calls this service, server to server.
const securityPlugin: FastifyPluginAsync = async (app) => {
  await app.register(helmet);
};

export default fp(securityPlugin, { name: 'security', fastify: '5.x' });
