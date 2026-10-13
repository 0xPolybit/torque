use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TorrentFilePriority {
    High,
    #[default]
    Normal,
    Low,
    Skip,
}

impl TorrentFilePriority {
    pub const fn is_selected(self) -> bool {
        !matches!(self, Self::Skip)
    }

    const fn order(self) -> u8 {
        match self {
            Self::High => 0,
            Self::Normal => 1,
            Self::Low => 2,
            Self::Skip => 3,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentFilePriorityUpdate {
    pub index: usize,
    pub priority: TorrentFilePriority,
}

pub fn ordered_file_indices(priorities: &[TorrentFilePriority], paths: &[String]) -> Vec<usize> {
    let mut indices: Vec<_> = (0..priorities.len()).collect();
    indices.sort_unstable_by(|left, right| {
        priorities[*left]
            .order()
            .cmp(&priorities[*right].order())
            .then_with(|| {
                paths
                    .get(*left)
                    .map(String::as_str)
                    .unwrap_or_default()
                    .cmp(paths.get(*right).map(String::as_str).unwrap_or_default())
            })
            .then_with(|| left.cmp(right))
    });
    indices
}

#[cfg(test)]
mod tests {
    use super::{ordered_file_indices, TorrentFilePriority as Priority};

    #[test]
    fn piece_order_respects_priority_then_path_and_keeps_every_file() {
        let priorities = [
            Priority::Low,
            Priority::High,
            Priority::Normal,
            Priority::Skip,
        ];
        let paths = ["a-low.bin", "z-high.bin", "m-normal.bin", "b-skip.bin"].map(str::to_string);

        assert_eq!(ordered_file_indices(&priorities, &paths), [1, 2, 0, 3]);
    }
}
