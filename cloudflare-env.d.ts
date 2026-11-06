declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    MAINTAINER_EMAILS?: string;
    BUCKET?: R2Bucket;
  }
}
