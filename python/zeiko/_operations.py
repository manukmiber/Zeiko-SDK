# Made by scripts/generate.mjs. Do not edit by hand.
from typing import Any
from urllib.parse import quote


def _q(value: str) -> str:
    return quote(str(value), safe="")


class Operations:
    def request(self, method: str, path: str, **options: Any) -> Any:
        raise NotImplementedError

    def get_account(self, **options: Any) -> Any:
        """Your account"""
        return self.request("GET", f"/v1/account", **options)

    def get_payments_pay_qris(self, pay: str, **options: Any) -> Any:
        """A QRIS payment"""
        return self.request("GET", f"/v1/payments/{_q(pay)}/qris", **options)

    def post_payments_pay_sent(self, pay: str, **options: Any) -> Any:
        """Say a QRIS payment was paid"""
        return self.request("POST", f"/v1/payments/{_q(pay)}/sent", **options)

    def get_payments_pay_receipt(self, pay: str, **options: Any) -> Any:
        """A receipt (PDF)"""
        return self.request("GET", f"/v1/payments/{_q(pay)}/receipt", **options)

    def get_receipts(self, **options: Any) -> Any:
        """Your receipts"""
        return self.request("GET", f"/v1/receipts", **options)

    def get_vps(self, **options: Any) -> Any:
        """Your servers and what can be ordered"""
        return self.request("GET", f"/v1/vps", **options)

    def post_vps_order(self, **options: Any) -> Any:
        """Order a server"""
        return self.request("POST", f"/v1/vps/order", **options)

    def post_vps_id_renew(self, id: str, **options: Any) -> Any:
        """Renew a server"""
        return self.request("POST", f"/v1/vps/{_q(id)}/renew", **options)

    def post_vps_id_upgrade(self, id: str, **options: Any) -> Any:
        """Upgrade a server's plan"""
        return self.request("POST", f"/v1/vps/{_q(id)}/upgrade", **options)

    def post_vps_id_downgrade(self, id: str, **options: Any) -> Any:
        """A cheaper plan from the next renewal"""
        return self.request("POST", f"/v1/vps/{_q(id)}/downgrade", **options)

    def post_vps_id_request(self, id: str, **options: Any) -> Any:
        """Start, stop, reboot, reinstall, new password, console"""
        return self.request("POST", f"/v1/vps/{_q(id)}/request", **options)

    def post_vps_id_request_rid_cancel(self, id: str, rid: str, **options: Any) -> Any:
        """Withdraw a request still open"""
        return self.request("POST", f"/v1/vps/{_q(id)}/request/{_q(rid)}/cancel", **options)

    def post_vps_id_address(self, id: str, **options: Any) -> Any:
        """Change a server's address"""
        return self.request("POST", f"/v1/vps/{_q(id)}/address", **options)

    def post_vps_id_cancel(self, id: str, **options: Any) -> Any:
        """Cancel an unpaid order"""
        return self.request("POST", f"/v1/vps/{_q(id)}/cancel", **options)

    def post_vps_id_end(self, id: str, **options: Any) -> Any:
        """End a server"""
        return self.request("POST", f"/v1/vps/{_q(id)}/end", **options)

    def get_hosting(self, **options: Any) -> Any:
        """Your hosting and what can be ordered"""
        return self.request("GET", f"/v1/hosting", **options)

    def post_hosting_order(self, **options: Any) -> Any:
        """Order a hosting"""
        return self.request("POST", f"/v1/hosting/order", **options)

    def post_hosting_id_renew(self, id: str, **options: Any) -> Any:
        """Renew a hosting"""
        return self.request("POST", f"/v1/hosting/{_q(id)}/renew", **options)

    def post_hosting_id_address(self, id: str, **options: Any) -> Any:
        """Change a hosting's address"""
        return self.request("POST", f"/v1/hosting/{_q(id)}/address", **options)

    def post_hosting_id_upgrade(self, id: str, **options: Any) -> Any:
        """Upgrade a hosting's plan"""
        return self.request("POST", f"/v1/hosting/{_q(id)}/upgrade", **options)

    def post_hosting_id_cancel(self, id: str, **options: Any) -> Any:
        """Cancel an unpaid order"""
        return self.request("POST", f"/v1/hosting/{_q(id)}/cancel", **options)

    def post_hosting_id_end(self, id: str, **options: Any) -> Any:
        """End a hosting"""
        return self.request("POST", f"/v1/hosting/{_q(id)}/end", **options)

    def get_sites(self, **options: Any) -> Any:
        """Your websites and what can be ordered"""
        return self.request("GET", f"/v1/sites", **options)

    def post_sites_order(self, **options: Any) -> Any:
        """Order a website"""
        return self.request("POST", f"/v1/sites/order", **options)

    def post_sites_id_renew(self, id: str, **options: Any) -> Any:
        """Renew a website"""
        return self.request("POST", f"/v1/sites/{_q(id)}/renew", **options)

    def post_sites_id_cancel(self, id: str, **options: Any) -> Any:
        """Cancel an unpaid order"""
        return self.request("POST", f"/v1/sites/{_q(id)}/cancel", **options)

    def get_sites_id_files(self, id: str, **options: Any) -> Any:
        """A website's files"""
        return self.request("GET", f"/v1/sites/{_q(id)}/files", **options)

    def post_sites_id_upload(self, id: str, **options: Any) -> Any:
        """Upload files"""
        return self.request("POST", f"/v1/sites/{_q(id)}/upload", **options)

    def post_sites_id_files_delete(self, id: str, **options: Any) -> Any:
        """Delete files"""
        return self.request("POST", f"/v1/sites/{_q(id)}/files/delete", **options)

    def get_sites_id_content(self, id: str, **options: Any) -> Any:
        """A template site's content"""
        return self.request("GET", f"/v1/sites/{_q(id)}/content", **options)

    def put_sites_id_content(self, id: str, **options: Any) -> Any:
        """Save a template site's content"""
        return self.request("PUT", f"/v1/sites/{_q(id)}/content", **options)

    def get_proxies(self, **options: Any) -> Any:
        """Your proxies and what can be ordered"""
        return self.request("GET", f"/v1/proxies", **options)

    def get_proxies_options_product(self, product: str, **options: Any) -> Any:
        """Where a product can be had"""
        return self.request("GET", f"/v1/proxies/options/{_q(product)}", **options)

    def post_proxies_order(self, **options: Any) -> Any:
        """Order proxies"""
        return self.request("POST", f"/v1/proxies/order", **options)

    def post_proxies_id_renew(self, id: str, **options: Any) -> Any:
        """Renew proxies"""
        return self.request("POST", f"/v1/proxies/{_q(id)}/renew", **options)

    def post_proxies_id_traffic(self, id: str, **options: Any) -> Any:
        """Add traffic"""
        return self.request("POST", f"/v1/proxies/{_q(id)}/traffic", **options)

    def post_proxies_id_cancel(self, id: str, **options: Any) -> Any:
        """Cancel an unpaid order"""
        return self.request("POST", f"/v1/proxies/{_q(id)}/cancel", **options)

    def post_proxies_id_access(self, id: str, **options: Any) -> Any:
        """Who may use the proxies"""
        return self.request("POST", f"/v1/proxies/{_q(id)}/access", **options)

    def post_proxies_id_protocol(self, id: str, **options: Any) -> Any:
        """HTTP, HTTPS or SOCKS5"""
        return self.request("POST", f"/v1/proxies/{_q(id)}/protocol", **options)

    def get_events(self, **options: Any) -> Any:
        """What happened on the account"""
        return self.request("GET", f"/v1/events", **options)
