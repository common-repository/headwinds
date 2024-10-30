<?php

header('Content-Type: text/html');
$root = dirname(dirname(dirname(dirname(__FILE__))));
if (file_exists($root.'/wp-load.php')) {
		// WP 2.6
		require_once($root.'/wp-load.php');
} else {
		// Before 2.6
		require_once($root.'/wp-config.php');
}


// If you hardcode a KaPoW API key here, all key config screens will be hidden
$kapow_api_key = '';
# Base hostname for API requests (API key is always prepended to this)
$kapow_service_host = 'staff.berich.vn';
# URL for the home page for the AntiSpam service
$kapow_service_url = 'http://staff.berich.vn/api/';
# URL for the page where a user can obtain an API key
$kapow_apikey_url = 'http://staff.berich.vn/api/';
# Plugin version
$kapow_plugin_ver = '1.0';
# API Protocol version
$kapow_protocol_ver = '1.0';
# Port for API requests to service host
$kapow_api_port = 80;





/*

function kapow_init() {
	global $kapow_api_key, $kapow_api_host, $kapow_api_port, $kapow_service_host;

	if ( $kapow_api_key )
		$kapow_api_host = $kapow_api_key . '.' . $kapow_service_host;
	else
		$kapow_api_host = get_option('kapow_api_key') . '.' . $kapow_service_host;

	$kapow_api_port = 80;
	add_action('admin_menu', 'kapow_config_page');
}
add_action('init', 'kapow_init');

if ( !function_exists('wp_nonce_field') ) {
	function kapow_nonce_field($action = -1) { return; }
	$kapow_nonce = -1;
} else {
	function kapow_nonce_field($action = -1) { return wp_nonce_field($action); }
	$kapow_nonce = 'kapow-update-key';
}

if ( !function_exists('number_format_i18n') ) {
	function number_format_i18n( $number, $decimals = null ) { return number_format( $number, $decimals ); }
}

function kapow_config_page() {
	if ( function_exists('add_submenu_page') )
		add_submenu_page('plugins.php', __('KaPoW Configuration'), __('KaPoW Configuration'), 'manage_options', 'kapow-key-config', 'kapow_conf');

}

function kapow_conf() {
	global $kapow_nonce, $kapow_api_key,
	    $kapow_service_host, $kapow_apikey_url,
	    $kapow_service_url;

	if ( isset($_POST['submit']) ) {
		if ( function_exists('current_user_can') && !current_user_can('manage_options') )
			die(__('Cheatin&#8217; uh?'));

		check_admin_referer( $kapow_nonce );
		$key = preg_replace( '/[^a-h0-9]/i', '', $_POST['key'] );

		if ( empty($key) ) {
			$key_status = 'empty';
			$ms[] = 'new_key_empty';
			delete_option('kapow_api_key');
		} else {
			$key_status = kapow_verify_key( $key );
		}

		if ( $key_status == 'valid' ) {
			update_option('kapow_api_key', $key);
			$ms[] = 'new_key_valid';
		} else if ( $key_status == 'invalid' ) {
			$ms[] = 'new_key_invalid';
		} else if ( $key_status == 'failed' ) {
			$ms[] = 'new_key_failed';
		}

		if ( isset( $_POST['kapow_discard_month'] ) )
			update_option( 'kapow_discard_month', 'true' );
		else
			update_option( 'kapow_discard_month', 'false' );
	}

	if ( $key_status != 'valid' ) {
		$key = get_option('kapow_api_key');
		if ( empty( $key ) ) {
			if ( $key_status != 'failed' ) {
				if ( kapow_verify_key( '1234567890ab' ) == 'failed' )
					$ms[] = 'no_connection';
				else
					$ms[] = 'key_empty';
			}
			$key_status = 'empty';
		} else {
			$key_status = kapow_verify_key( $key );
		}
		if ( $key_status == 'valid' ) {
			$ms[] = 'key_valid';
		} else if ( $key_status == 'invalid' ) {
			delete_option('kapow_api_key');
			$ms[] = 'key_empty';
		} else if ( !empty($key) && $key_status == 'failed' ) {
			$ms[] = 'key_failed';
		}
	}

	$messages = array(
		'new_key_empty' => array('color' => 'aa0', 'text' => __('Your key has been cleared.')),
		'new_key_valid' => array('color' => '2d2', 'text' => __('Your key has been verified. Happy blogging!')),
		'new_key_invalid' => array('color' => 'd22', 'text' => __('The key you entered is invalid. Please double-check it.')),
		'new_key_failed' => array('color' => 'd22', 'text' => sprintf(__('The key you entered could not be verified because a connection to %s could not be established. Please check your server configuration.'), $kapow_service_host)),
		'no_connection' => array('color' => 'd22', 'text' => __('There was a problem connecting to the KaPoW server. Please check your server configuration.')),
		'key_empty' => array('color' => 'aa0', 'text' => sprintf(__('Please enter an API key. (<a href="%s" style="color:#fff">Get your key.</a>)'), $kapow_apikey_url)),
		'key_valid' => array('color' => '2d2', 'text' => __('This key is valid.')),
		'key_failed' => array('color' => 'aa0', 'text' => __('The key below was previously validated but a connection to %s can not be established at this time. Please check your server configuration.', $kapow_service_host)));
?>
<?php if ( !empty($_POST ) ) : ?>
<div id="message" class="updated fade"><p><strong><?php _e('Options saved.') ?></strong></p></div>
<?php endif; ?>
<div class="wrap">
<h2><?php _e('KaPoW Configuration'); ?></h2>
<div class="narrow">
<form action="" method="post" id="kapow-conf" style="margin: auto; width: 400px; ">
<?php if ( !$kapow_api_key ) { ?>
	<p><?php printf(__('<a href="%1$s">KaPoW</a> is a free service from Six Apart that helps protect your blog from spam. The KaPoW plugin will send every comment or Pingback submitted to your blog to the service for evaluation, and will filter items if KaPoW determines it is spam. If you don\'t have a KaPoW key yet, you can get one at <a href="%2$s">antispam.typepad.com</a>.'), $kapow_service_url, $kapow_apikey_url); ?></p>

<?php kapow_nonce_field($kapow_nonce) ?>
<h3><label for="key"><?php _e('KaPoW API Key'); ?></label></h3>
<?php foreach ( $ms as $m ) : ?>
	<p style="padding: .5em; background-color: #<?php echo $messages[$m]['color']; ?>; color: #fff; font-weight: bold;"><?php echo $messages[$m]['text']; ?></p>
<?php endforeach; ?>
<p><input id="key" name="key" type="text" size="15" maxlength="64" value="<?php echo get_option('kapow_api_key'); ?>" style="font-family: 'Courier New', Courier, mono; font-size: 1.5em;" /> (<?php _e('<a href="http://antispam.typepad.com/">What is this?</a>'); ?>)</p>
<?php if ( true ) { ?>
<h3><?php _e('Why might my key be invalid?'); ?></h3>
<p><?php _e('This can mean one of two things, either you copied the key wrong or that the plugin is unable to reach the KaPoW servers, which is most often caused by an issue with your web host around firewalls or similar.'); ?></p>
<?php } ?>
<?php } ?>
<p><label><input name="kapow_discard_month" id="kapow_discard_month" value="true" type="checkbox" <?php if ( get_option('kapow_discard_month') == 'true' ) echo ' checked="checked" '; ?> /> <?php _e('Automatically discard spam comments on posts older than a month.'); ?></label></p>
	<p class="submit"><input type="submit" name="submit" value="<?php _e('Update options &raquo;'); ?>" /></p>
</form>
</div>
</div>
<?php
}

function kapow_verify_key( $key ) {
	return true;
}

if ( !get_option('kapow_api_key') && !$kapow_api_key && !isset($_POST['submit']) ) {
	function kapow_warning() {
		echo "
		<div id='kapow-warning' class='updated fade'><p><strong>".__('KaPoW is almost ready.')."</strong> ".sprintf(__('You must <a href="%1$s">enter your KaPoW API key</a> for it to work.'), "plugins.php?page=kapow-key-config")."</p></div>
		";
	}
	add_action('admin_notices', 'kapow_warning');
	return;
}
*/
?>