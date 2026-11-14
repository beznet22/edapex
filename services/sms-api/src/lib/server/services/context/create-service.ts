import type { ServiceContext } from "./service-context";

export type ServiceConstructor<TService> = new (ctx: ServiceContext) => TService;

/** The only construction path for a service (`02` P3). */
export function createService<TService>(
  Service: ServiceConstructor<TService>,
  ctx: ServiceContext
): TService {
  return new Service(ctx);
}
