import unittest

from app.services.assignment_service import (
    find_assignment,
    get_submission_rate,
    list_submitted_students,
)


class AssignmentServiceTests(unittest.TestCase):
    def test_find_assignment(self):
        result = find_assignment("朱艺", 3)
        self.assertEqual(result["submitted"], "是")
        self.assertEqual(result["file_count"], 49)

    def test_invalid_phase(self):
        with self.assertRaises(ValueError):
            list_submitted_students(8)

    def test_get_submission_rate(self):
        result = get_submission_rate(3)
        self.assertEqual(result["submitted_count"], 3)
        self.assertEqual(result["total_students"], 10)
        self.assertEqual(result["submission_rate"], 30.0)


if __name__ == "__main__":
    unittest.main()
