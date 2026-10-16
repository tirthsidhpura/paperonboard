import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('gtu_headers', Path(__file__).resolve().parents[1] / 'scripts/gtu_headers.py')
headers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(headers)


class HeaderTests(unittest.TestCase):
    def test_uses_printed_semester_instead_of_guessing_from_subject_code(self):
        result = headers.parse_header('GTU MCA SEMESTER I EXAMINATION\nSubject Code: 619402\nSubject Name: Object Oriented Programming in Java\nTime: 10:30 AM')
        self.assertEqual(result, {'periodType': 'semester', 'period': 1, 'name': 'Object Oriented Programming in Java'})

    def test_year_based_course_and_multiline_name(self):
        result = headers.parse_header('B.PHARM PRACTICE FIRST YEAR EXAMINATION\nSubject Name:\nPharmaceutical\nChemistry\nTime: 10:30 AM')
        self.assertEqual(result, {'periodType': 'year', 'period': 1, 'name': 'Pharmaceutical Chemistry'})

    def test_does_not_use_mentions_of_years_inside_exam_questions(self):
        self.assertIsNone(headers.parse_header('GTU EXAMINATION\nSubject Code: 1234567\nSubject Name: Accountancy\nTime: 10:30 AM\nQ.1 Calculate the year 2 revenue.'))


if __name__ == '__main__':
    unittest.main()
