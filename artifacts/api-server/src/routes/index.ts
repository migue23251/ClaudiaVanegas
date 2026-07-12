import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import productsRouter from "./products";
import catalogRouter from "./catalog";
import customersRouter from "./customers";
import suppliersRouter from "./suppliers";
import purchaseOrdersRouter from "./purchase_orders";
import accountsPayableRouter from "./accounts_payable";
import salesRouter from "./sales";
import accountsReceivableRouter from "./accounts_receivable";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(catalogRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(productsRouter);
router.use(customersRouter);
router.use(suppliersRouter);
router.use(purchaseOrdersRouter);
router.use(accountsPayableRouter);
router.use(salesRouter);
router.use(accountsReceivableRouter);
router.use(dashboardRouter);
router.use(reportsRouter);
router.use(settingsRouter);

export default router;
