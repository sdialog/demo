import os
import io
import sys
import json
import random
from enum import Enum
from typing import Union
from pydantic import Field
from flask import Flask, render_template, jsonify, request, send_file

from sdialog import Context  # noqa: E402
from sdialog import config
from sdialog.agents import Agent  # noqa: E402
from sdialog.personas import Persona  # noqa: E402
from sdialog.audio.room import Room, Dimensions3D, Position3D  # noqa: E422
from sdialog.audio.pipeline import to_audio  # noqa: E402
from sdialog.audio.tts import KokoroTTS
from sdialog.audio.voice_database import HuggingfaceVoiceDatabase  # noqa: E402
from sdialog.generators.base import BaseAttributeModelGenerator
from sdialog.audio.utils import Role  # noqa: E402

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))


class SdialogJSONEncoder(json.JSONEncoder):
    """A custom JSON encoder to handle sdialog's specific data types."""
    def default(self, obj):
        if isinstance(obj, Enum):
            return obj.name  # Convert enums like RGBAColor to their string name
        if hasattr(obj, 'to_list'):
            # This will handle Position3D and Dimensions3D
            return obj.to_list()
        if hasattr(obj, '__dict__'):
            return obj.__dict__
        return json.JSONEncoder.default(self, obj)


CLAUDE_PERSONA_GENERATOR_N_PROMPT = """System: You are an expert persona creator. You will be asked to create a set of personas with specific attributes.
You must return a JSON object that is a list of personas.
Each object in the list must conform to the JSON schema provided.
Do not include any other text, reasoning, or preamble. Output only the raw JSON list inside a single ```json code block.

For example, if asked for 1 persona, the output should look like:
```json
[
  {
    "name": "John Doe",
    "age": 30,
    "race": "Caucasian",
    "gender": "Male",
    "role": "Software Engineer",
    "background": "Grew up in a small town, studied computer science.",
    "personality": "Introverted, analytical, and curious.",
    "circumstances": "Recently moved to a new city for a job.",
    "rules": "Must always speak in a formal tone."
  }
]
```

Human:
Please generate {{ n }} diverse and distinct personas.
The JSON schema for each persona object is:
```json
{{ attributes }}
```
"""  # noqa: E501


class SafePersona(Persona):
    name: str = Field("Not specified", description="Name of the persona.")
    age: Union[int, str] = Field("Not specified", description="Age (integer or descriptive string like 'middle-aged').")
    race: str = Field("Not specified", description="Race or ethnicity.")
    gender: str = Field("Not specified", description="Gender of the persona.")
    role: str = Field("Not specified", description="Role, profession, or primary identity descriptor.")
    background: str = Field("Not specified", description="Background or life history summary.")
    personality: str = Field("Not specified", description="Personality traits summary.")
    circumstances: str = Field("Not specified", description="Current situational context.")
    rules: str = Field("Not specified", description="Constraints, style, or behavioral rules to enforce.")


class PersonaGenerator(BaseAttributeModelGenerator):

    def __init__(self, model_is_claude=False, **kwargs):

        generation_template = SafePersona()

        # Set fields to None to trigger generation in BaseAttributeModelGenerator
        for field in SafePersona.model_fields:
            if field != 'language':  # Keep the default for language
                setattr(generation_template, field, None)

        if model_is_claude:
            prompt_n_to_use = CLAUDE_PERSONA_GENERATOR_N_PROMPT
        else:
            prompt_n_to_use = config.config["prompts"]["persona_generator_n"]

        super().__init__(
            attribute_model=generation_template,
            llm_prompt=config.config["prompts"]["persona_generator"],
            llm_prompt_n=prompt_n_to_use,
            generated_attributes='all',
            **kwargs
        )


def map_persona_age_to_voice_category(persona_age):
    """A helper to categorize persona age for voice matching."""
    if isinstance(persona_age, int):
        if persona_age < 30:
            return 'young'
        elif 30 <= persona_age < 60:
            return 'adult'
        else:
            return 'old'
    elif isinstance(persona_age, str):
        age_str = persona_age.lower()
        if 'young' in age_str:
            return 'young'
        if 'middle' in age_str or 'adult' in age_str:
            return 'adult'
        if 'old' in age_str or 'elderly' in age_str or 'senior' in age_str:
            return 'old'
    return 'adult'  # Default fallback


app = Flask(__name__)
app.json_encoder = SdialogJSONEncoder

# In-memory database
personas = []
dialogs = []
persona_voice_mapping = {}
rooms = []

# Initialize voice database
try:
    voice_db = HuggingfaceVoiceDatabase("sdialog/voices-kokoro")
    tts_engine = KokoroTTS()
except Exception as e:
    print(f"Could not load HuggingfaceVoiceDatabase or KokoroTTS: {e}")
    voice_db = None
    tts_engine = None

# This gives us the absolute path to the directory where app.py is located
APP_ROOT = os.path.dirname(os.path.abspath(__file__))


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/personas', methods=['GET'])
def get_personas():
    return jsonify([p.model_dump() for p in personas])


@app.route('/api/personas', methods=['POST'])
def create_persona():
    data = request.json
    # simple validation
    if 'name' not in data or not data['name']:
        return jsonify({'error': 'Name is required'}), 400
    if any(p.name == data['name'] for p in personas):
        return jsonify({'error': 'Persona with this name already exists'}), 400

    persona = Persona(**data)
    personas.append(persona)
    return jsonify(persona.model_dump()), 201


@app.route('/api/personas/generate', methods=['POST'])
def generate_personas():
    data = request.json
    model_config = data.get('model_config')

    model_string = None
    llm_kwargs = {}
    if model_config and model_config.get('provider') and model_config.get('model_name'):
        provider = model_config['provider']
        model_name = model_config['model_name']

        # If user includes provider prefix in model name, strip it.
        if model_name.startswith(f"{provider}:"):
            model_name = model_name[len(provider)+1:]

        if provider == 'amazon':
            model_string = f"amazon:{model_name}"

            if model_config.get('aws_bearer_token'):
                os.environ['AWS_BEARER_TOKEN_BEDROCK'] = model_config['aws_bearer_token']

            if model_config.get('region_name'):
                llm_kwargs['region_name'] = model_config['region_name']

        else:
            model_string = f"{provider}:{model_name}"

        model_is_claude = 'claude' in model_name.lower()
        generator = PersonaGenerator(model=model_string, model_is_claude=model_is_claude, **llm_kwargs)
        new_personas = generator.generate(n=2)

        if not isinstance(new_personas, list) or len(new_personas) < 2:
            return jsonify({"error": "Failed to generate 2 personas"}), 500

        # Remove existing speaker 1 and speaker 2
        global personas
        # personas = [p for p in personas if p.name not in ["speaker 1", "speaker 2"]]

        # new_personas[0].name = "speaker 1"
        # new_personas[1].name = "speaker 2"

        # Add the new personas
        personas.extend(new_personas)

        return jsonify([p.model_dump() for p in new_personas]), 201


@app.route('/api/auto-assign-voices', methods=['POST'])
def auto_assign_voices():
    if not voice_db:
        return jsonify({'error': 'Voice database not initialized'}), 500
    if not personas:
        return jsonify({'error': 'No personas to assign voices to'}), 400

    all_voices = []
    for lang_data in voice_db.get_data().values():
        for voices_list in lang_data.values():
            all_voices.extend(voices_list)

    # Make a mutable copy to track available voices
    available_voices = list(all_voices)

    global persona_voice_mapping
    persona_voice_mapping.clear()  # Start with a fresh mapping

    # A simple way to make assignments a bit more varied
    random.shuffle(available_voices)

    for persona in personas:
        persona_age_category = map_persona_age_to_voice_category(persona.age)
        persona_gender = persona.gender.lower() if isinstance(persona.gender, str) else 'unspecified'
        persona_lang = persona.language.lower().split('-')[0] if persona.language else 'en'

        # Find the best matching voice
        best_voice = None

        # 1. Exact match for lang, gender, and age
        candidates = [
            v for v in available_voices
            if v.language and v.language.lower().split('-')[0] == persona_lang and
            v.gender and isinstance(v.gender, str) and v.gender.lower() == persona_gender and
            map_persona_age_to_voice_category(v.age) == persona_age_category
        ]
        if candidates:
            best_voice = candidates[0]
        else:
            # 2. Match for lang and gender
            candidates = [
                v for v in available_voices
                if v.language and v.language.lower().split('-')[0] == persona_lang and
                v.gender and isinstance(v.gender, str) and v.gender.lower() == persona_gender
            ]
            if candidates:
                best_voice = candidates[0]

        if not best_voice:
            # 3. Match for lang only
            candidates = [
                v for v in available_voices
                if v.language and v.language.lower().split('-')[0] == persona_lang
            ]
            if candidates:
                best_voice = candidates[0]

        # 4. If still no voice, pick any available one (last resort)
        if not best_voice and available_voices:
            best_voice = available_voices[0]

        if best_voice:
            persona_voice_mapping[persona.name] = best_voice.identifier
            available_voices.remove(best_voice)  # Prevent reuse

    return jsonify(persona_voice_mapping)


@app.route('/api/dialogs', methods=['POST'])
def create_dialog():
    data = request.json
    persona1_name = data.get('persona1')
    persona2_name = data.get('persona2')
    context_data = data.get('context', {})
    max_turns = data.get('max_turns', 10)
    model_config = data.get('model_config')

    persona1 = next((p for p in personas if p.name == persona1_name), None)
    persona2 = next((p for p in personas if p.name == persona2_name), None)

    if not persona1 or not persona2:
        return jsonify({'error': 'One or both personas not found'}), 404

    model_string = None
    llm_kwargs = {}
    if model_config and model_config.get('provider') and model_config.get('model_name'):
        provider = model_config['provider']
        model_name = model_config['model_name']

        # If user includes provider prefix in model name, strip it.
        if model_name.startswith(f"{provider}:"):
            model_name = model_name[len(provider)+1:]

        if provider == 'amazon':
            model_string = f"amazon:{model_name}"

            if model_config.get('aws_bearer_token'):
                os.environ['AWS_BEARER_TOKEN_BEDROCK'] = model_config['aws_bearer_token']

            if model_config.get('region_name'):
                llm_kwargs['region_name'] = model_config['region_name']
        else:
            model_string = f"{provider}:{model_name}"

        # Create separate kwargs for each agent to ensure they are distinct objects
        llm_kwargs1 = llm_kwargs.copy()
        llm_kwargs2 = llm_kwargs.copy()

        agent1 = Agent(persona=persona1, name=persona1.name, model=model_string, **llm_kwargs1)
        agent2 = Agent(persona=persona2, name=persona2.name, model=model_string, **llm_kwargs2)

        context = Context(**context_data)

        dialog = agent1.dialog_with(agent2, context=context, max_turns=max_turns)
        dialogs.append(dialog)

        return jsonify(dialog.model_dump())


@app.route('/api/voices', methods=['GET'])
def get_voices():
    if not voice_db:
        return jsonify({'error': 'Voice database not initialized'}), 500

    all_voices = []
    for lang_data in voice_db.get_data().values():
        for voices in lang_data.values():
            all_voices.extend([v.model_dump() for v in voices])
    return jsonify(all_voices)


@app.route('/api/personas/<string:persona_name>/assign-voice', methods=['POST'])
def assign_voice(persona_name):
    data = request.json
    voice_identifier = data.get('voice_identifier')

    persona = next((p for p in personas if p.name == persona_name), None)
    if not persona:
        return jsonify({'error': 'Persona not found'}), 404

    # Here we are just storing the mapping.
    # The actual voice object can be retrieved from the voice_db when needed.
    persona_voice_mapping[persona_name] = voice_identifier

    return jsonify({'message': f'Voice {voice_identifier} assigned to {persona_name}'})


@app.route('/api/persona-voices', methods=['GET'])
def get_persona_voices():
    return jsonify(persona_voice_mapping)


@app.route('/api/rooms', methods=['POST'])
def create_room():
    data = request.json
    name = data.get('name', f"Room_{len(rooms)+1}")
    width = float(data.get('width', 5))
    length = float(data.get('length', 4))
    height = float(data.get('height', 3))

    dimensions = Dimensions3D(width=width, length=length, height=height)

    # Explicitly place two speakers to ensure they are present for visualization
    speaker1_pos = Position3D(x=width * 0.25, y=length / 2, z=1.6)
    speaker2_pos = Position3D(x=width * 0.75, y=length / 2, z=1.6)

    room = Room(
        name=name,
        dimensions=dimensions,
        speakers_positions={
            Role.SPEAKER_1: speaker1_pos,
            Role.SPEAKER_2: speaker2_pos,
        }
    )
    rooms.append(room)

    return jsonify(room.model_dump(mode='json')), 201


@app.route('/api/rooms', methods=['GET'])
def get_rooms():
    return jsonify([r.model_dump(mode='json') for r in rooms])


@app.route('/api/rooms/<string:room_id>/image')
def get_room_image(room_id):
    room_obj = next((r for r in rooms if r.id == room_id), None)
    if not room_obj:
        return jsonify({'error': 'Room not found'}), 404

    try:
        img = room_obj.to_image()
        img_io = io.BytesIO()
        img.save(img_io, 'PNG')
        img_io.seek(0)
        return send_file(img_io, mimetype='image/png')
    except Exception as e:
        # This can happen if fonts are not available on the system for PIL
        print(f"Error generating room image: {e}")
        return jsonify({'error': 'Could not generate room image'}), 500


@app.route('/api/rooms/<string:room_id>', methods=['DELETE'])
def delete_room(room_id):
    global rooms
    room_to_delete = next((r for r in rooms if r.id == room_id), None)
    if not room_to_delete:
        return jsonify({'error': 'Room not found'}), 404

    rooms = [r for r in rooms if r.id != room_id]
    return jsonify({'message': 'Room deleted successfully'}), 200


@app.route('/api/dialogs/<string:dialog_id>/generate-audio', methods=['POST'])
def generate_audio(dialog_id):
    data = request.json
    do_step_1 = data.get('do_step_1', False)
    do_step_2 = data.get('do_step_2', False)
    do_step_3 = data.get('do_step_3', False)
    room_name = data.get('room_name')

    dialog_obj = next((d for d in dialogs if d.id == dialog_id), None)
    if not dialog_obj:
        return jsonify({'error': 'Dialog not found'}), 404

    room_obj = next((r for r in rooms if r.name == room_name), None) if room_name else None
    if do_step_3 and not room_obj:
        return jsonify({'error': 'Room not found for step 3'}), 404

    if not voice_db or not tts_engine:
        return jsonify({'error': 'Audio components not initialized'}), 500

    # Create a directory for this dialog's audio using an absolute path
    dialog_audio_dir = os.path.join(APP_ROOT, 'static', 'audio', dialog_id)
    os.makedirs(dialog_audio_dir, exist_ok=True)

    perform_acoustics = do_step_2 or do_step_3
    audio_dialog = to_audio(
        dialog=dialog_obj,
        dir_audio=dialog_audio_dir,
        perform_room_acoustics=perform_acoustics,
        tts_engine=tts_engine,
        voice_database=voice_db,
        room=room_obj if perform_acoustics else None,
        override_tts_audio=do_step_1
    )

    # This returns the paths to the generated files
    return jsonify(audio_dialog.model_dump(mode='json'))


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=1231)
