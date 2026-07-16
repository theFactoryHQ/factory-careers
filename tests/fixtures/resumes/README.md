# Resume parser corpus

These files are generated fixtures with no candidate or employee data. They
exercise document shapes that previously could not be distinguished from parser
failures:

- `compressed-multipage.pdf`: compressed page streams across two pages.
- `subset-font.pdf`: a TrueType subset font embedded by ReportLab.
- `multi-column.pdf`: text content positioned in two columns.
- `image-only.pdf`: one embedded raster image and no PDF text layer; expected
  result is `no_text` / `no_extractable_text`.
- `password-protected.pdf`: encrypted with the synthetic password
  `fixture-password`; expected failure is `password_required`, non-retryable.
- `truncated.pdf`: a PDF header and catalog prefix without an xref table,
  trailer, or EOF marker; expected failure is `invalid_pdf`, non-retryable.
- `valid.docx`: generated Office Open XML resume content.
- `valid.doc`: LibreOffice-generated Word 97 resume content.

Run `python3 tests/fixtures/resumes/generate.py` to regenerate the corpus. The
generator requires ReportLab, python-docx, Pillow, pypdf, and LibreOffice. It
normalizes PDF and OOXML metadata so repeated runs with the same dependency
versions are byte-for-byte stable.
