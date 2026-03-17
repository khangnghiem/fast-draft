//! Spec and animation APIs.

use crate::FdCanvas;
use fd_core::id::NodeId;
use fd_core::model::{AnimKeyframe, AnimProperties, AnimTrigger, Color, Easing, Paint, Spec};
use fd_editor::sync::GraphMutation;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
impl FdCanvas {
    /// Get the displayable spec text for a node.
    pub fn get_spec(&self, node_id: &str) -> String {
        let id = NodeId::intern(node_id);
        self.engine
            .graph
            .get_by_id(id)
            .and_then(|n| n.spec.as_ref())
            .map(|s| s.display_text())
            .unwrap_or_default()
    }

    /// Set the spec for a node from raw markdown text.
    pub fn set_spec(&mut self, node_id: &str, content: &str) -> bool {
        let id = NodeId::intern(node_id);
        let spec = if content.is_empty() {
            None
        } else {
            Some(Spec::from_description(content.to_string()))
        };
        let mutations = vec![GraphMutation::SetSpec { id, spec }];
        let changed = self.apply_mutations(mutations);
        if changed {
            self.engine.flush_to_text();
        }
        changed
    }

    /// Get all specs across the entire document.
    pub fn get_all_specs(&self) -> String {
        let mut result = Vec::new();
        for node in self.engine.graph.graph.node_weights() {
            if let Some(ref spec) = node.spec {
                let id_str = node.id.as_str();
                result.push(serde_json::json!({
                    "id": id_str,
                    "spec": spec.display_text(),
                }));
            }
        }
        for edge in &self.engine.graph.edges {
            if let Some(ref spec) = edge.spec {
                let id_str = edge.id.as_str();
                result.push(serde_json::json!({
                    "id": id_str,
                    "spec": spec.display_text(),
                }));
            }
        }
        serde_json::Value::Array(result).to_string()
    }

    /// Add an animation to a node by ID.
    pub fn add_animation_to_node(
        &mut self,
        node_id: &str,
        trigger: &str,
        props_json: &str,
    ) -> bool {
        let id = NodeId::intern(node_id);
        let anim_trigger = match trigger {
            "hover" => AnimTrigger::Hover,
            "press" => AnimTrigger::Press,
            "enter" => AnimTrigger::Enter,
            other => AnimTrigger::Custom(other.to_string()),
        };

        let props_val: serde_json::Value = match serde_json::from_str(props_json) {
            Ok(v) => v,
            Err(_) => return false,
        };

        let mut anim_props = AnimProperties::default();
        if let Some(s) = props_val.get("scale").and_then(|v| v.as_f64()) {
            anim_props.scale = Some(s as f32);
        }
        if let Some(o) = props_val.get("opacity").and_then(|v| v.as_f64()) {
            anim_props.opacity = Some(o as f32);
        }
        if let Some(r) = props_val.get("rotate").and_then(|v| v.as_f64()) {
            anim_props.rotate = Some(r as f32);
        }
        if let Some(color) = props_val
            .get("fill")
            .and_then(|v| v.as_str())
            .and_then(Color::from_hex)
        {
            anim_props.fill = Some(Paint::Solid(color));
        }

        let duration_ms = props_val
            .get("duration")
            .and_then(|v| v.as_u64())
            .unwrap_or(300) as u32;

        let easing = match props_val.get("ease").and_then(|v| v.as_str()) {
            Some("linear") => Easing::Linear,
            Some("ease_in") => Easing::EaseIn,
            Some("ease_out") => Easing::EaseOut,
            Some("ease_in_out") => Easing::EaseInOut,
            _ => Easing::Spring,
        };

        let keyframe = AnimKeyframe {
            trigger: anim_trigger,
            duration_ms,
            easing,
            properties: anim_props,
            delay_ms: None,
            use_template: None,
        };

        let mut current_anims = self
            .engine
            .graph
            .get_by_id(id)
            .map(|n| n.animations.clone())
            .unwrap_or_default();

        current_anims.retain(|a| a.trigger != keyframe.trigger);
        current_anims.push(keyframe);

        let mutations = vec![GraphMutation::SetAnimations {
            id,
            animations: current_anims,
        }];
        let changed = self.apply_mutations(mutations);
        if changed {
            self.engine.flush_to_text();
        }
        changed
    }

    /// Get animations for a node as a JSON array.
    pub fn get_node_animations_json(&self, node_id: &str) -> String {
        let id = NodeId::intern(node_id);
        let animations = self
            .engine
            .graph
            .get_by_id(id)
            .map(|n| &n.animations)
            .cloned()
            .unwrap_or_default();
        serde_json::to_string(&animations).unwrap_or_else(|_| "[]".to_string())
    }

    /// Remove all animations from a node. Returns `true` if changed.
    pub fn remove_node_animations(&mut self, node_id: &str) -> bool {
        let id = NodeId::intern(node_id);
        let mutations = vec![GraphMutation::SetAnimations {
            id,
            animations: Default::default(),
        }];
        let changed = self.apply_mutations(mutations);
        if changed {
            self.engine.flush_to_text();
        }
        changed
    }
}
