import Foundation
import Speech

func fail(_ message: String, code: Int32 = 1) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(code)
}

guard CommandLine.arguments.count >= 2 else {
  fail("Usage: macos-stt <audio.wav>")
}

let audioURL = URL(fileURLWithPath: CommandLine.arguments[1])
guard FileManager.default.fileExists(atPath: audioURL.path) else {
  fail("Audio file not found: \(audioURL.path)")
}

let localeID = ProcessInfo.processInfo.environment["GWEN_STT_LOCALE"] ?? "en-US"
let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeID))
guard let recognizer else {
  fail("Speech recognizer unavailable for locale \(localeID)")
}
guard recognizer.isAvailable else {
  fail("Speech recognizer is currently unavailable")
}

let authSemaphore = DispatchSemaphore(value: 0)
var authStatus = SFSpeechRecognizer.authorizationStatus()
if authStatus == .notDetermined {
  SFSpeechRecognizer.requestAuthorization { status in
    authStatus = status
    authSemaphore.signal()
  }
  _ = authSemaphore.wait(timeout: .now() + 30)
}

guard authStatus == .authorized else {
  fail("Speech recognition permission is not authorized")
}

let request = SFSpeechURLRecognitionRequest(url: audioURL)
request.shouldReportPartialResults = false
request.requiresOnDeviceRecognition =
  ProcessInfo.processInfo.environment["GWEN_STT_ON_DEVICE"] == "1"

let recognitionSemaphore = DispatchSemaphore(value: 0)
var finalText = ""
var finalError: Error?

let task = recognizer.recognitionTask(with: request) { result, error in
  if let result {
    finalText = result.bestTranscription.formattedString
    if result.isFinal {
      recognitionSemaphore.signal()
    }
  }
  if let error {
    finalError = error
    recognitionSemaphore.signal()
  }
}

let timeoutSeconds = Double(ProcessInfo.processInfo.environment["GWEN_STT_TIMEOUT_SECONDS"] ?? "30") ?? 30
let waitResult = recognitionSemaphore.wait(timeout: .now() + timeoutSeconds)
task.cancel()

if waitResult == .timedOut {
  fail("Speech recognition timed out")
}

if let finalError, finalText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
  fail(finalError.localizedDescription)
}

print(finalText.trimmingCharacters(in: .whitespacesAndNewlines))
