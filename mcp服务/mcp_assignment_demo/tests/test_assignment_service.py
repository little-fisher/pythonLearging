import unittest

from app.services.assignment_service import find_assignment, list_submitted_students


class AssignmentServiceTests(unittest.TestCase):
    def test_find_assignment(self):
        result = find_assignment("朱艺", 3)
        self.assertEqual(result["submitted"], "是")
        self.assertEqual(result["file_count"], 49)

    def test_invalid_phase(self):
        with self.assertRaises(ValueError):
            list_submitted_students(8)


if __name__ == "__main__":
    unittest.main()
