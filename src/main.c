#include <pebble.h>

//------------------------------------Key Definitions------------------------------------//

#define KEY_STATUS 0

//---------------------------------Pointer Declarations----------------------------------//

static Window *s_main_window;
static TextLayer *s_text_layer;

//--------------------------------Data Updating Functions--------------------------------//

static void update_status(Tuple *t) {
  static char buffer[32];
  snprintf(buffer, sizeof(buffer), "%s", t->value->cstring);
  text_layer_set_text(s_text_layer, buffer);
}

//---------------------------------App Messege Callbacks---------------------------------//

static void inbox_received_callback(DictionaryIterator *iterator, void *context) {
  APP_LOG(APP_LOG_LEVEL_INFO, "Updating Display Elements");
  
   // Read first item
  Tuple *t = dict_read_first(iterator);
  
  // For all items
  while(t != NULL) {
    // Which key was received?
    switch(t->key) {
    case KEY_STATUS:
      update_status(t);
      break;
    default:
      APP_LOG(APP_LOG_LEVEL_ERROR, "Key %d not recognized!", (int)t->key);
      break;
    }

    // Look for next item
    t = dict_read_next(iterator);
  }
  
  APP_LOG(APP_LOG_LEVEL_INFO, "Elements Updated");
}

static void inbox_dropped_callback(AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "Message dropped!");
}

static void outbox_failed_callback(DictionaryIterator *iterator, AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "Outbox send failed!");
}

static void outbox_sent_callback(DictionaryIterator *iterator, void *context) {
  APP_LOG(APP_LOG_LEVEL_INFO, "Outbox send success!");
}

//---------------------------------Pebble UI Init/Deinit---------------------------------//

void init(void) {
  // Create Window
  s_main_window = window_create();
  #ifdef PBL_COLOR
  window_set_background_color(s_main_window, GColorPictonBlue);
  #else
  window_set_background_color(s_main_window, GColorWhite);
  #endif
  
  // Create text layer
  #if defined(PBL_RECT)
  s_text_layer = text_layer_create(GRect(0, 63, 144, 35));
  #elif defined(PBL_ROUND)
  s_text_layer = text_layer_create(GRect(0, 70, 180, 35));
  #endif
  text_layer_set_background_color(s_text_layer, GColorClear);
  #ifdef PBL_COLOR
  text_layer_set_text_color(s_text_layer, GColorWhite);
  #else
  text_layer_set_text_color(s_text_layer, GColorBlack);
  #endif
  text_layer_set_text_alignment(s_text_layer, GTextAlignmentCenter);
  text_layer_set_font(s_text_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28));
  text_layer_set_text(s_text_layer, "Connecting");
  layer_add_child(window_get_root_layer(s_main_window), text_layer_get_layer(s_text_layer));
  
  // Show the Window on the watch, with animated=true
  window_stack_push(s_main_window, true);
  
  // Register callbacks
  app_message_register_inbox_received(inbox_received_callback);
  app_message_register_inbox_dropped(inbox_dropped_callback);
  app_message_register_outbox_failed(outbox_failed_callback);
  app_message_register_outbox_sent(outbox_sent_callback);
  
  // Open AppMessage
  app_message_open(200, 0);
}

void deinit(void) {
  text_layer_destroy(s_text_layer);
  window_destroy(s_main_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}