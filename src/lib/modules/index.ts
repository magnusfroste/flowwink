/**
 * Module Registry
 * 
 * Central coordinator for all FlowWink modules. Handles registration,
 * validation, and execution of module operations.
 * 
 * Individual module implementations are in src/lib/modules/*.ts
 * 
 * @see docs/MODULE-API.md for full documentation
 */

export { blogModule } from './blog-module';
export { newsletterModule } from './newsletter-module';
export { crmModule } from './crm-module';
export { pagesModule } from './pages-module';
export { kbModule } from './kb-module';
export { productsModule } from './products-module';
export { bookingModule } from './booking-module';
export { globalBlocksModule } from './global-blocks-module';
export { mediaModule } from './media-module';
export { dealsModule } from './deals-module';
export { companiesModule } from './companies-module';
export { formsModule } from './forms-module';
export { ordersModule } from './orders-module';
export { webinarsModule } from './webinars-module';
