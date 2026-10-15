#!/usr/bin/env python3
import os
from pathlib import Path
from gtts import gTTS

fixtures = [
    {
        "id": "01_english_deploy",
        "lang": "en",
        "text": "Please prepare the weekly deployment report by tomorrow evening at 5 PM."
    },
    {
        "id": "02_hindi_meeting",
        "lang": "hi",
        "text": "कल सुबह दस बजे तक टीम मीटिंग के नोट्स भेज देना और क्लाइंट का डेटा चेक कर लेना।"
    },
    {
        "id": "03_gujarati_review",
        "lang": "gu",
        "text": "આવતીકાલે બપોરે ત્રણ વાગ્યે પ્રોજેક્ટનો રિવ્યુ કરવાનો છે અને રિપોર્ટ મોકલવાનો છે."
    },
    {
        "id": "04_hinglish_release",
        "lang": "hi",
        "text": "Kal shaam tak production release ready hona chahiye aur testing team ko update de dena."
    }
]

out_dir = Path("fixtures/audio")
out_dir.mkdir(parents=True, exist_ok=True)

print("Generating synthetic speech fixtures for benchmark testing...")
for item in fixtures:
    audio_path = out_dir / f"{item['id']}.wav"
    txt_path = out_dir / f"{item['id']}.txt"
    mp3_temp = out_dir / f"{item['id']}.mp3"
    
    # Generate MP3 via gTTS
    tts = gTTS(text=item["text"], lang=item["lang"], slow=False)
    tts.save(str(mp3_temp))
    
    # Convert to 16kHz mono WAV via ffmpeg
    os.system(f"ffmpeg -y -i {mp3_temp} -ar 16000 -ac 1 {audio_path} >/dev/null 2>&1")
    if mp3_temp.exists():
        mp3_temp.unlink()
        
    # Write ground-truth reference
    txt_path.write_text(item["text"], encoding="utf-8")
    print(f"Created: {audio_path.name} (Lang: {item['lang']})")

print("Done! Fixtures created in fixtures/audio/")
