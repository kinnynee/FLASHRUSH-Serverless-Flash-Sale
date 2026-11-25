import unittest
from load_test import evaluate

class LoadReportTests(unittest.TestCase):
    def test_quantity_conservation(self):
        rows = [{'status':'CONFIRMED','quantity':3}, {'status':'OUT_OF_STOCK','quantity':3}]
        self.assertTrue(evaluate(rows, 2, 5, 2))
        self.assertFalse(evaluate(rows, 1, 5, 2))
        self.assertFalse(evaluate(rows, 2, 5, 3))
        self.assertFalse(evaluate([{'status':'PENDING','quantity':1}], 5, 5, 1))
