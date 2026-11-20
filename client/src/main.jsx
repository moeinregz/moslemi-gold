import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, Link } from "react-router-dom";
import "./styles.css";
import { SiteProvider } from "./store/context.jsx";
import Layout from "./store/Layout.jsx";
import Home from "./store/Home.jsx";
import Shop from "./store/Shop.jsx";
import Product from "./store/Product.jsx";
import Cart from "./store/Cart.jsx";
import Checkout from "./store/Checkout.jsx";
import Account from "./store/Account.jsx";
import { OrderView, Track, MockPay } from "./store/Order.jsx";

// پنل مدیریت جدا بارگذاری می‌شه تا سایت برای مشتری سبک بمونه
const AdminApp = lazy(() => import("./admin/AdminApp.jsx"));

function NotFound() {
  return <div className="page"><div className="container empty"><h1 className="page-title">صفحه پیدا نشد</h1><Link to="/" className="btn btn-gold mt">صفحه‌ی اصلی</Link></div></div>;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<Suspense fallback={<div className="login-wrap"><div className="loader" /></div>}><AdminApp /></Suspense>} />
        <Route element={<SiteProvider><Layout /></SiteProvider>}>
          <Route index element={<Home />} />
          <Route path="shop" element={<Shop />} />
          <Route path="product/:slug" element={<Product />} />
          <Route path="cart" element={<Cart />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="order/:code" element={<OrderView />} />
          <Route path="track" element={<Track />} />
          <Route path="account" element={<Account />} />
          <Route path="pay/mock" element={<MockPay />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
