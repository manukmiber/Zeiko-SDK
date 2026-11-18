// Made by scripts/generate.mjs. Do not edit by hand.

export interface CallOptions {
  /** Added to the address. */
  query?: Record<string, string | number | boolean>;
  /** Sent as JSON. */
  body?: unknown;
  /** Same key and body within a day: done once. Made for you when left out. */
  idempotencyKey?: string;
}

export abstract class Operations {
  abstract request(method: string, path: string, options?: CallOptions): Promise<any>;

  /** Your account */
  getAccount(options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/account`, options);
  }

  /** A QRIS payment */
  getPaymentsPayQris(pay: string, options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/payments/${encodeURIComponent(pay)}/qris`, options);
  }

  /** Say a QRIS payment was paid */
  postPaymentsPaySent(pay: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/payments/${encodeURIComponent(pay)}/sent`, options);
  }

  /** The next QR of a payment in parts */
  postPaymentsPayNext(pay: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/payments/${encodeURIComponent(pay)}/next`, options);
  }

  /** A receipt (PDF) */
  getPaymentsPayReceipt(pay: string, options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/payments/${encodeURIComponent(pay)}/receipt`, options);
  }

  /** Your receipts */
  getReceipts(options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/receipts`, options);
  }

  /** Your servers and what can be ordered */
  getVps(options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/vps`, options);
  }

  /** Order a server */
  postVpsOrder(options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/vps/order`, options);
  }

  /** Renew a server */
  postVpsIdRenew(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/vps/${encodeURIComponent(id)}/renew`, options);
  }

  /** Upgrade a server's plan */
  postVpsIdUpgrade(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/vps/${encodeURIComponent(id)}/upgrade`, options);
  }

  /** A cheaper plan from the next renewal */
  postVpsIdDowngrade(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/vps/${encodeURIComponent(id)}/downgrade`, options);
  }

  /** Start, stop, reboot, reinstall, new password, console */
  postVpsIdRequest(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/vps/${encodeURIComponent(id)}/request`, options);
  }

  /** Withdraw a request still open */
  postVpsIdRequestRidCancel(id: string, rid: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/vps/${encodeURIComponent(id)}/request/${encodeURIComponent(rid)}/cancel`, options);
  }

  /** Change a server's address */
  postVpsIdAddress(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/vps/${encodeURIComponent(id)}/address`, options);
  }

  /** Cancel an unpaid order */
  postVpsIdCancel(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/vps/${encodeURIComponent(id)}/cancel`, options);
  }

  /** Refused: refunds go through us */
  postVpsIdEnd(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/vps/${encodeURIComponent(id)}/end`, options);
  }

  /** Your hosting and what can be ordered */
  getHosting(options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/hosting`, options);
  }

  /** Order a hosting */
  postHostingOrder(options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/hosting/order`, options);
  }

  /** Renew a hosting */
  postHostingIdRenew(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/hosting/${encodeURIComponent(id)}/renew`, options);
  }

  /** Change a hosting's address */
  postHostingIdAddress(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/hosting/${encodeURIComponent(id)}/address`, options);
  }

  /** Upgrade a hosting's plan */
  postHostingIdUpgrade(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/hosting/${encodeURIComponent(id)}/upgrade`, options);
  }

  /** Cancel an unpaid order */
  postHostingIdCancel(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/hosting/${encodeURIComponent(id)}/cancel`, options);
  }

  /** Refused: refunds go through us */
  postHostingIdEnd(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/hosting/${encodeURIComponent(id)}/end`, options);
  }

  /** Your websites and what can be ordered */
  getSites(options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/sites`, options);
  }

  /** Order a website */
  postSitesOrder(options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/sites/order`, options);
  }

  /** Renew a website */
  postSitesIdRenew(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/sites/${encodeURIComponent(id)}/renew`, options);
  }

  /** Cancel an unpaid order */
  postSitesIdCancel(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/sites/${encodeURIComponent(id)}/cancel`, options);
  }

  /** A website's files */
  getSitesIdFiles(id: string, options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/sites/${encodeURIComponent(id)}/files`, options);
  }

  /** Upload files */
  postSitesIdUpload(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/sites/${encodeURIComponent(id)}/upload`, options);
  }

  /** Delete files */
  postSitesIdFilesDelete(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/sites/${encodeURIComponent(id)}/files/delete`, options);
  }

  /** A template site's content */
  getSitesIdContent(id: string, options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/sites/${encodeURIComponent(id)}/content`, options);
  }

  /** Save a template site's content */
  putSitesIdContent(id: string, options?: CallOptions): Promise<any> {
    return this.request('PUT', `/v1/sites/${encodeURIComponent(id)}/content`, options);
  }

  /** Your proxies and what can be ordered */
  getProxies(options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/proxies`, options);
  }

  /** Where a product can be had */
  getProxiesOptionsProduct(product: string, options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/proxies/options/${encodeURIComponent(product)}`, options);
  }

  /** Order proxies */
  postProxiesOrder(options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/proxies/order`, options);
  }

  /** Renew proxies */
  postProxiesIdRenew(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/proxies/${encodeURIComponent(id)}/renew`, options);
  }

  /** Add traffic */
  postProxiesIdTraffic(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/proxies/${encodeURIComponent(id)}/traffic`, options);
  }

  /** Cancel an unpaid order */
  postProxiesIdCancel(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/proxies/${encodeURIComponent(id)}/cancel`, options);
  }

  /** Who may use the proxies */
  postProxiesIdAccess(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/proxies/${encodeURIComponent(id)}/access`, options);
  }

  /** HTTP, HTTPS or SOCKS5 */
  postProxiesIdProtocol(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/proxies/${encodeURIComponent(id)}/protocol`, options);
  }

  /** What happened on the account */
  getEvents(options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/events`, options);
  }

  /** Renew from the balance by itself */
  postHostingIdAutoRenew(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/hosting/${encodeURIComponent(id)}/auto-renew`, options);
  }

  /** Renew from the balance by itself */
  postVpsIdAutoRenew(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/vps/${encodeURIComponent(id)}/auto-renew`, options);
  }

  /** Pay a QRIS payment from the balance */
  postPaymentsPaySaldo(pay: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/payments/${encodeURIComponent(pay)}/saldo`, options);
  }

  /** Your database projects and what can be ordered */
  getDatabases(options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/databases`, options);
  }

  /** Order a database project */
  postDatabasesProjects(options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/databases/projects`, options);
  }

  /** Delete a project */
  deleteDatabasesProjectsId(id: string, options?: CallOptions): Promise<any> {
    return this.request('DELETE', `/v1/databases/projects/${encodeURIComponent(id)}`, options);
  }

  /** Renew a project */
  postDatabasesProjectsIdRenew(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/databases/projects/${encodeURIComponent(id)}/renew`, options);
  }

  /** Move a project to a bigger plan */
  postDatabasesProjectsIdUpgrade(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/databases/projects/${encodeURIComponent(id)}/upgrade`, options);
  }

  /** Wake a paused free project */
  postDatabasesProjectsIdResume(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/databases/projects/${encodeURIComponent(id)}/resume`, options);
  }

  /** Make a database */
  postDatabasesProjectsIdDbs(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/databases/projects/${encodeURIComponent(id)}/dbs`, options);
  }

  /** A project's usage this month */
  getDatabasesProjectsIdUsage(id: string, options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/databases/projects/${encodeURIComponent(id)}/usage`, options);
  }

  /** Delete a database */
  deleteDatabasesDbsId(id: string, options?: CallOptions): Promise<any> {
    return this.request('DELETE', `/v1/databases/dbs/${encodeURIComponent(id)}`, options);
  }

  /** A database's snapshots and archives */
  getDatabasesDbsIdSnapshots(id: string, options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/databases/dbs/${encodeURIComponent(id)}/snapshots`, options);
  }

  /** Take a snapshot now */
  postDatabasesDbsIdSnapshots(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/databases/dbs/${encodeURIComponent(id)}/snapshots`, options);
  }

  /** Make a download archive */
  postDatabasesDbsIdExport(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/databases/dbs/${encodeURIComponent(id)}/export`, options);
  }

  /** A link to download an archive */
  getDatabasesDbsIdExportsSidDownload(id: string, sid: string, options?: CallOptions): Promise<any> {
    return this.request('GET', `/v1/databases/dbs/${encodeURIComponent(id)}/exports/${encodeURIComponent(sid)}/download`, options);
  }

  /** Restore a snapshot into a new database */
  postDatabasesDbsIdRestore(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/databases/dbs/${encodeURIComponent(id)}/restore`, options);
  }

  /** Switch on a PostgreSQL extension */
  postDatabasesDbsIdExtensions(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/databases/dbs/${encodeURIComponent(id)}/extensions`, options);
  }

  /** Change the snapshot schedule */
  postDatabasesProjectsIdSnapshots(id: string, options?: CallOptions): Promise<any> {
    return this.request('POST', `/v1/databases/projects/${encodeURIComponent(id)}/snapshots`, options);
  }
}
