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

  /** End a server */
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

  /** End a hosting */
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
}
