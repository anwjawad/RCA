// templates.js - Report Templates & Dynamic Fields

const Templates = {
    // 1. Modality -> Organ -> Disease
    DATA: {
        'US': {
            'Abdomen': {
                'Normal': {
                    id: 'us_abd_normal',
                    title: 'Normal Abdomen',
                    content: `<p><b>Liver:</b> Normal size ({{liver_span_cm}} cm), smooth outline, homogeneous echotexture. No focal lesions. Intrahepatic bile ducts are not dilated.</p>
                              <p><b>Gallbladder:</b> {{gallbladder_status}}. Wall thickness is normal.</p>
                              <p><b>Pancreas:</b> Normal size and echotexture. No focal masses.</p>
                              <p><b>Spleen:</b> Normal size, homogeneous parenchyma.</p>
                              <p><b>Kidneys:</b> Bilateral normal size, shape, and position. No stones or hydronephrosis.</p>
                              <p><b>Aorta/IVC:</b> Normal caliber.</p>
                              <p><b>Free Fluid:</b> No ascites seen.</p>`,
                    fields: [
                        { key: 'liver_span_cm', label: 'Liver Span (cm)', type: 'number', default: '14' },
                        { key: 'gallbladder_status', label: 'Gallbladder', type: 'select', options: ['Distended, thin-walled, no stones', 'Contracted', 'Surgically absent'], default: 'Distended, thin-walled, no stones' }
                    ]
                },
                'Fatty Liver': {
                    id: 'us_abd_fatty',
                    title: 'Fatty Liver',
                    content: `<p><b>Liver:</b> Enabling increased echogenicity (Grade {{fatty_grade}}) causing mild attenuation of the sound beam. No focal lesions seen.</p>
                              <p><b>Impression:</b> Findings consistent with fatty infiltration of the liver.</p>`,
                    fields: [
                        { key: 'fatty_grade', label: 'Grade', type: 'select', options: ['I', 'II', 'III'], default: 'I' }
                    ]
                }
            }
        },
        'CT': {
            'Chest': {
                'Normal': {
                    id: 'ct_chest_normal',
                    title: 'Normal Chest',
                    content: `<p><b>Lungs:</b> Clear lung fields bilaterally. No focal nodules, masses, or consolidation.</p>
                              <p><b>Pleura:</b> No pleural effusion or pneumothorax.</p>
                              <p><b>Mediastinum:</b> Normal mediastinal contour. No adenopathy.</p>
                              <p><b>Heart:</b> Normal size. No pericardial effusion.</p>
                              <p><b>Bones:</b> No suspicious lytic or sclerotic lesions.</p>`,
                    fields: []
                },
                'Pneumonia': {
                    id: 'ct_chest_pna',
                    title: 'Pneumonia',
                    content: `<p><b>Lungs:</b> Patchy consolidation seen in the {{lobe}} lobe with air bronchograms.</p>
                              <p><b>Impression:</b> Features suggestive of {{lobe}} lobe pneumonia.</p>`,
                    fields: [
                        { key: 'lobe', label: 'Affected Lobe', type: 'select', options: ['RUL', 'RML', 'RLL', 'LUL', 'LLL'], default: 'RLL' }
                    ]
                }
            }
        },
        'MRI': {
            'Brain': {
                'Normal': {
                    id: 'mri_brain_normal',
                    title: 'Normal Brain',
                    content: `<p><b>Parenchyma:</b> Normal signal intensity of gray and white matter. No distinct focal lesions.</p>
                              <p><b>Ventricles:</b> Normal size and configuration. No hydrocephalus.</p>
                              <p><b>Midline:</b> No shift.</p>`,
                    fields: []
                },
                'Stroke': {
                    id: 'mri_brain_stroke',
                    title: 'Acute Stroke',
                    content: `<p><b>Parenchyma:</b> Area of restricted diffusion (high DWI, low ADC) participating the {{artery}} territory.</p>
                              <p><b>Impression:</b> Acute ischemic infarction in the {{artery}} distribution.</p>`,
                    fields: [
                        { key: 'artery', label: 'Vessel Territory', type: 'text', default: 'MCA' }
                    ]
                }
            }
        }
    },

    // Helper: Replace Placeholders
    compile: (templateId, values) => {
        // Find template by ID (inefficient but fine for MVP)
        // ... traversing hierarchy ...
        // For MVP we assume we are passed the content string directly or find it easily.
        // This logic will be in App.js controller.
        return "";
    }
};
