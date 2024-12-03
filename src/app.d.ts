declare namespace App {
    interface Locals {
        ctx?: {
            db: import('$lib/server/database').Database;
            user?: Omit<import('$lib/server/database/models/app').User, 'createdAt' | 'updatedAt'> | undefined;
        };
    }
}
