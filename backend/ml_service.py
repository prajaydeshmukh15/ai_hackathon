import os
import math
import pickle
import joblib
import pandas as pd
from typing import List, Dict, Any
from backend.models import PredictRequest, PredictResponse

class MLService:
    def __init__(self):
        self.model = None
        self.inventory: List[Dict[str, Any]] = []
        self._init_inventory()
        self._load_model_artifacts()

    def _init_inventory(self):
        csv_path = os.path.join(os.path.dirname(__file__), "dead_stock_pharma.csv")
        if os.path.exists(csv_path):
            try:
                df = pd.read_csv(csv_path)
                rows: List[Dict[str, Any]] = []
                for _, r in df.iterrows():
                    d = dict(r)
                    out = {
                        "product_id": d.get("product_id"),
                        "productid": d.get("product_id"),
                        "category": d.get("category"),
                        "days_in_stock": float(d.get("days_in_stock", 0)),
                        "daysinstock": float(d.get("days_in_stock", 0)),
                        "weekly_sales_30d": float(d.get("weekly_sales_30d", 0)),
                        "weeklysales30d": float(d.get("weekly_sales_30d", 0)),
                        "stock_qty": float(d.get("stock_qty", 0)),
                        "stockqty": float(d.get("stock_qty", 0)),
                        "discounts_tried": int(d.get("discounts_tried", 0)),
                        "discountstried": int(d.get("discounts_tried", 0)),
                        "season_match": float(d.get("season_match", 1.0)),
                        "seasonmatch": float(d.get("season_match", 1.0)),
                        "sales_velocity": float(d.get("sales_velocity", 0)),
                        "stock_sales_ratio": float(d.get("stock_sales_ratio", 0)),
                        "aging_risk": float(d.get("aging_risk", 0)),
                        "discount_fail": float(d.get("discount_fail", 0)),
                        "low_demand": float(d.get("low_demand", 0)),
                        "dead_stock_risk": float(d.get("dead_stock_risk", 0)),
                        "deadstockrisk": float(d.get("dead_stock_risk", 0)),
                        "label": int(d.get("label", 0)),
                        "days_to_dead": float(d.get("days_to_dead", 365.0)),
                        "unit_price": float(d.get("unit_price", 0)),
                        "locked_capital": float(d.get("locked_capital", 0)),
                        "lockedcapital": float(d.get("locked_capital", 0)),
                    }
                    rows.append(out)
                self.inventory = rows
                return
            except Exception:
                pass
        # Fallback demo inventory
        self.inventory = [
            {"productid": "P0011", "category": "Vitamin", "daysinstock": 98, "lockedcapital": 36448, "deadstockrisk": 0.7, "label": 1},
            {"productid": "P0068", "category": "Painkiller", "daysinstock": 132, "lockedcapital": 23661, "deadstockrisk": 0.9, "label": 1},
            {"productid": "P0213", "category": "Antibiotic", "daysinstock": 198, "lockedcapital": 39223, "deadstockrisk": 0.9, "label": 1},
            {"productid": "P0000", "category": "Generic", "daysinstock": 14, "lockedcapital": 15561, "deadstockrisk": 0.3, "label": 0},
        ]

    def _load_model_artifacts(self):
        base = os.path.dirname(__file__)
        pkl_candidates = [
            os.path.join(base, "artifacts", "pharma_deadstock_model.pkl"),
            os.path.join(base, "artifacts", "model.joblib"),
            os.path.join(base, "pharma_deadstock_model.pkl"),
        ]
        for path in pkl_candidates:
            try:
                if os.path.exists(path):
                    if path.endswith(".pkl"):
                        with open(path, "rb") as f:
                            self.model = pickle.load(f)
                    else:
                        self.model = joblib.load(path)
                    break
            except Exception:
                self.model = None

    def engineer_features(self, data: PredictRequest) -> pd.DataFrame:
        salesvelocity = data.weeklysales30d / 4 if data.weeklysales30d else 0.0
        stocksalesratio = data.stockqty / max(salesvelocity, 1.0)
        agingrisk = 1.0 if data.daysinstock > 90 else 0.0
        discountfail = 1.0 if data.discountstried > 2 else 0.0
        lowdemand = 1.0 if salesvelocity < 2 else 0.0
        return pd.DataFrame([{
            "daysinstock": float(data.daysinstock),
            "weeklysales30d": float(data.weeklysales30d),
            "stockqty": float(data.stockqty),
            "discountstried": float(data.discountstried),
            "seasonmatch": float(data.seasonmatch),
            "salesvelocity": float(salesvelocity),
            "stocksalesratio": float(stocksalesratio),
            "agingrisk": float(agingrisk),
            "discountfail": float(discountfail),
            "lowdemand": float(lowdemand),
        }])

    def _model_risk(self, X: pd.DataFrame) -> float:
        if self.model is None:
            aging = float(X["agingrisk"].iloc[0])
            season = float(X["seasonmatch"].iloc[0])
            ssr = float(X["stocksalesratio"].iloc[0])
            dfail = float(X["discountfail"].iloc[0])
            low = float(X["lowdemand"].iloc[0])
            r = 0.4 * aging + 0.25 * (1.0 - season) + 0.3 * (1.0 if ssr > 6 else 0.0) + 0.2 * dfail + 0.1 * low
            return max(0.0, min(1.0, r))
        try:
            if hasattr(self.model, "predict_proba"):
                proba = self.model.predict_proba(X)
                if isinstance(proba, list):
                    proba = proba[0]
                p = float(proba[:, 1][0]) if hasattr(proba, "__getitem__") else float(proba)
                return max(0.0, min(1.0, p))
            y = self.model.predict(X)
            val = float(y[0]) if hasattr(y, "__getitem__") else float(y)
            if 0.0 <= val <= 1.0:
                return val
            return 1.0 if val >= 1.0 else 0.0
        except Exception:
            aging = float(X["agingrisk"].iloc[0])
            season = float(X["seasonmatch"].iloc[0])
            ssr = float(X["stocksalesratio"].iloc[0])
            dfail = float(X["discountfail"].iloc[0])
            low = float(X["lowdemand"].iloc[0])
            r = 0.4 * aging + 0.25 * (1.0 - season) + 0.3 * (1.0 if ssr > 6 else 0.0) + 0.2 * dfail + 0.1 * low
            return max(0.0, min(1.0, r))

    def predict(self, data: PredictRequest) -> Dict[str, Any]:
        X = self.engineer_features(data)
        risk = self._model_risk(X)
        label = 1 if risk > 0.5 else 0
        days_to_dead = max(90 - float(data.daysinstock), 0.0) if label else 365.0
        action = "Safe - Monitor"
        if risk > 0.8:
            action = "🚨 Bundle / Transfer / Hospital Discount"
        elif risk > 0.5:
            action = "⚠️ Reprice + Monitor"
        return {
            "risk_percent": round(risk * 100, 1),
            "label": label,
            "days_to_dead": days_to_dead,
            "action": action
        }

    def get_inventory(self) -> List[Dict[str, Any]]:
        return self.inventory

    def get_top_risky(self, limit: int = 5) -> List[Dict[str, Any]]:
        scored: List[Dict[str, Any]] = []
        for r in self.inventory:
            base = dict(r)
            risk = base.get("dead_stock_risk", base.get("deadstockrisk"))
            if risk is None:
                data = PredictRequest(
                    identifier=str(base.get("product_id") or base.get("productid") or ""),
                    daysinstock=float(base.get("days_in_stock") or base.get("daysinstock") or 0),
                    weeklysales30d=float(base.get("weekly_sales_30d") or base.get("weeklysales30d") or 0),
                    stockqty=float(base.get("stock_qty") or base.get("stockqty") or 0),
                    discountstried=int(base.get("discounts_tried") or base.get("discountstried") or 0),
                    seasonmatch=float(base.get("season_match") or base.get("seasonmatch") or 1.0),
                )
                X = self.engineer_features(data)
                risk = self._model_risk(X)
            out = dict(base)
            out["deadstockrisk"] = float(risk)
            out["dead_stock_risk"] = float(risk)
            out["label"] = 1 if float(risk) > 0.5 else 0
            scored.append(out)
        risky = [r for r in scored if r.get("label") == 1]
        return risky[:limit]

    def kpis(self) -> Dict[str, Any]:
        scored = self.get_top_risky(limit=100000)
        total = 0.0
        for r in self.inventory:
            total += float(r.get("locked_capital") or r.get("lockedcapital") or 0.0)
        var = 0.0
        for r in scored:
            var += float(r.get("locked_capital") or r.get("lockedcapital") or 0.0)
        return {
            "total": int(total),
            "riskyCount": len(scored),
            "var": int(var),
            "aiSavings": int(var * 0.27)
        }

    def search(self, term: str) -> List[Dict[str, Any]]:
        t = term.strip().lower()
        if not t:
            return []
        rows: List[Dict[str, Any]] = []
        for r in self.inventory:
            pid = str(r.get("product_id") or r.get("productid") or "").lower()
            cat = str(r.get("category") or "").lower()
            if t in pid or t in cat:
                rows.append(r)
        return rows[:20]

    def heatmap(self) -> Dict[str, Dict[str, int]]:
        """
        Distribute inventory across warehouses and calculate risk using ML model.
        Since CSV doesn't have warehouse data, we distribute items based on product_id hash
        to ensure consistent warehouse assignment.
        """
        warehouses = {
            "Delhi": {"safe": 0, "medium": 0, "high": 0, "critical": 0, "items": []},
            "Mumbai": {"safe": 0, "medium": 0, "high": 0, "critical": 0, "items": []},
            "Chennai": {"safe": 0, "medium": 0, "high": 0, "critical": 0, "items": []}
        }
        
        warehouse_names = list(warehouses.keys())
        
        # Distribute inventory items across warehouses
        for r in self.inventory:
            product_id = str(r.get("product_id") or r.get("productid") or "")
            # Use hash to consistently assign items to warehouses
            warehouse_idx = hash(product_id) % len(warehouse_names)
            warehouse_name = warehouse_names[warehouse_idx]
            warehouses[warehouse_name]["items"].append(r)
        
        # Calculate risk for each warehouse using ML model
        for warehouse_name, warehouse_data in warehouses.items():
            for r in warehouse_data["items"]:
                # Get or calculate risk score using ML model
                v = r.get("dead_stock_risk") or r.get("deadstockrisk")
                if v is None:
                    data = PredictRequest(
                        identifier=str(r.get("product_id") or r.get("productid") or ""),
                        daysinstock=float(r.get("days_in_stock") or r.get("daysinstock") or 0),
                        weeklysales30d=float(r.get("weekly_sales_30d") or r.get("weeklysales30d") or 0),
                        stockqty=float(r.get("stock_qty") or r.get("stockqty") or 0),
                        discountstried=int(r.get("discounts_tried") or r.get("discountstried") or 0),
                        seasonmatch=float(r.get("season_match") or r.get("seasonmatch") or 1.0),
                    )
                    X = self.engineer_features(data)
                    v = self._model_risk(X)
                
                risk = float(v)
                
                # Categorize by risk level
                if risk >= 0.85:
                    warehouse_data["critical"] += 1
                elif risk >= 0.7:
                    warehouse_data["high"] += 1
                elif risk >= 0.5:
                    warehouse_data["medium"] += 1
                else:
                    warehouse_data["safe"] += 1
        
        # Return only the counts, not the items
        result = {}
        for warehouse_name, warehouse_data in warehouses.items():
            result[warehouse_name] = {
                "safe": warehouse_data["safe"],
                "medium": warehouse_data["medium"],
                "high": warehouse_data["high"],
                "critical": warehouse_data["critical"]
            }
        
        return result


ml_service = MLService()
