import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { exportTemplate, importTemplate } from '../controllers/templateController.js';

const router = express.Router();

// All template routes require authentication
router.use(authMiddleware);

// Export rewards or bounties
router.get('/export', exportTemplate);

// Import rewards or bounties
router.post('/import', importTemplate);

export default router;
