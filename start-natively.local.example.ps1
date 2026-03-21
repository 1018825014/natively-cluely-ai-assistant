# Copy this file to start-natively.local.ps1 and set local-only overrides.
# The real start-natively.local.ps1 is ignored by git.

# Example:
# $env:NATIVELY_STT_PROVIDER = 'alibaba'
# $env:NATIVELY_STT_LANGUAGE = 'chinese'
# $env:NATIVELY_ALIBABA_STT_API_KEY = 'your-bailian-api-key'
# $env:NATIVELY_TECHNICAL_GLOSSARY_PATH = "$PSScriptRoot\\tmp\\alibaba-hotwords.txt"
# Optional: used by sync-alibaba-hotwords.ps1 when creating or reusing a hotword list.
# $env:NATIVELY_ALIBABA_VOCABULARY_PREFIX = 'natstt'
# Optional if you already created a Bailian hotword vocabulary:
# $env:NATIVELY_ALIBABA_WORKSPACE_ID = 'your-workspace-id'
# $env:NATIVELY_ALIBABA_VOCABULARY_ID = 'your-vocabulary-id'
