declare namespace App {
    interface Locals {
        ctx?: {
            db: import('$lib/server/database').Database;
            logger: import('pino').Logger;
        };
    }
}
